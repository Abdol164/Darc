"use client";

/**
 * The approvals inbox: payments an agent asked for that the card would not allow on its own.
 * Each waits on-chain; the owner approves with one passkey prompt or declines, from any
 * signed-in device. The list polls the chain, so a request appears within seconds wherever the
 * owner is looking, and a device signed up for alerts also gets a notification.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Hex } from "viem";
import { Button, Notice } from "./ui";
import { merchantName } from "@/config/merchants";
import { approveHeldPayment, declineHeldPayment, describeHoldReason, loadHeldPayments, type HeldPayment } from "@/lib/approvals";
import { getCard, last4 } from "@/lib/cards";
import { txUrl } from "@/lib/chain";
import { useOwner } from "@/lib/owner-context";
import { fmtSettle } from "@/lib/spend";
import a from "./approvals.module.css";

type Outcome = { id: Hex; tone: "ok" | "declined" | "error"; text: string; href?: string };

const POLL_MS = 4000;

/** Polls the chain for open requests on the given cards. */
export function useHeldPayments(cardIds: readonly Hex[]) {
  const [held, setHeld] = useState<HeldPayment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const key = cardIds.join(",");
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current || !key) {
      setLoaded(true);
      return;
    }
    busy.current = true;
    try {
      setHeld(await loadHeldPayments(key.split(",") as Hex[]));
    } catch {
      // A failed poll keeps the last list; the next one tries again.
    } finally {
      busy.current = false;
      setLoaded(true);
    }
  }, [key]);

  useEffect(() => {
    void load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  return { held, loaded, reload: load };
}

export function ApprovalInbox({
  cardIds,
  emptyText = "Nothing is waiting for you. When an agent asks for a payment its card does not allow, it appears here.",
  onSettled,
}: {
  cardIds: readonly Hex[];
  emptyText?: string;
  onSettled?: () => void;
}) {
  const { runOwnerAction, busy } = useOwner();
  const { held, loaded, reload } = useHeldPayments(cardIds);
  const [working, setWorking] = useState<Hex>();
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [, tick] = useState(0);

  // Re-render each second so the expiry countdowns move.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const record = (o: Outcome) => setOutcomes((prev) => [o, ...prev.filter((x) => x.id !== o.id)].slice(0, 4));

  const approve = async (p: HeldPayment) => {
    setWorking(p.id);
    try {
      const result = await runOwnerAction("Approving the payment", (wallet) => approveHeldPayment(wallet, p.id));
      if (result) {
        record({
          id: p.id,
          tone: result.ok ? "ok" : "declined",
          text: result.ok
            ? `Paid $${p.amountUsd} to ${merchantName(p.merchant)} with your approval · recorded in ${fmtSettle(result.settleMs)}`
            : `Refused even with your approval: ${result.reason}`,
          href: txUrl(result.hash),
        });
      }
    } catch (err) {
      record({ id: p.id, tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setWorking(undefined);
      await reload();
      onSettled?.();
    }
  };

  const decline = async (p: HeldPayment) => {
    setWorking(p.id);
    try {
      const result = await declineHeldPayment(p.id);
      record({
        id: p.id,
        tone: "declined",
        text: `Declined. Recorded as a refusal: ${result.reason ?? "refused"}`,
        href: txUrl(result.hash),
      });
    } catch (err) {
      record({ id: p.id, tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setWorking(undefined);
      await reload();
      onSettled?.();
    }
  };

  return (
    <div className={a.inbox}>
      {outcomes.map((o) => (
        <Notice key={o.id} tone={o.tone === "error" ? "error" : "info"} title={o.tone === "ok" ? "Approved" : o.tone === "declined" ? "Declined" : "That did not go through"}>
          {o.text}
          {o.href && (
            <>
              {" "}
              <a href={o.href} target="_blank" rel="noreferrer">
                view
              </a>
            </>
          )}
        </Notice>
      ))}

      {held.map((p) => {
        const card = getCard(p.cardId);
        const left = Math.max(0, Math.floor((p.expiresAt - Date.now()) / 1000));
        return (
          <article key={p.id} className={a.item}>
            <div className={a.main}>
              <div className={a.kicker}>
                <span className={a.pulse} />
                Needs your approval{card ? ` · ${card.agentName} ·· ${last4(card.agentAddress)}` : ""}
              </div>
              <h3 className={a.title}>
                Approve ${p.amountUsd} to {merchantName(p.merchant)}?
              </h3>
              <p className={a.reason}>{describeHoldReason(p.reason)}</p>
              <div className={a.meta}>
                Expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
              </div>
            </div>
            <div className={a.actions}>
              <Button variant="primary" onClick={() => approve(p)} disabled={!!busy || !!working}>
                {working === p.id && busy ? busy : "Approve with passkey"}
              </Button>
              <Button variant="ghost" onClick={() => decline(p)} disabled={!!busy || !!working}>
                {working === p.id && !busy ? "Declining…" : "Decline"}
              </Button>
            </div>
          </article>
        );
      })}

      {loaded && held.length === 0 && outcomes.length === 0 && <p className={a.empty}>{emptyText}</p>}
    </div>
  );
}
