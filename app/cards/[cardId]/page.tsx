"use client";

/**
 * Card detail — the card itself, its policy, and Atlas working through its goals beside it.
 *
 * The agent run is the point of this screen. It is not a row of buttons: the agent takes its
 * own goal list, chooses an amount and a merchant per goal, and reacts to each refusal
 * according to WHY it was refused (see lib/agent.ts). The transcript narrates its reasoning
 * so the behaviour is legible rather than implied.
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { Shell } from "@/components/shell";
import { Button, DataRow, Empty, Notice, Panel, StatusBadge, Table, ui as u } from "@/components/ui";
import { AgentCardFace } from "@/components/agent-card";
import { AddressLink, MerchantCell, Snippet, pieces as p, tintClass } from "@/components/pieces";
import { MERCHANTS, merchantName } from "@/config/merchants";
import { ADDRESSES, cardManagerAbi, spendRouterAbi } from "@/lib/contracts";
import { ApprovalInbox } from "@/components/approvals";
import { BURST_WINDOW_S, RuleFields } from "@/components/rule-fields";
import { merchantRoot } from "@/lib/merkle";
import { AGENT, TASKS, decide, held, intendLine, line, summarise, type Line, type TaskOutcome } from "@/lib/agent";
import { getCard, last4, listAttempts, saveAttempt, saveCard, type StoredCard } from "@/lib/cards";
import { fmtSettle, relay, signSpend, type RelayResult } from "@/lib/spend";
import { chain, fmtUsd, loadAttestations, loadCardState, publicClient, txUrl, type Attestation, type CardState } from "@/lib/chain";
import { useOwner } from "@/lib/owner-context";

export default function CardDetailPage() {
  const params = useParams<{ cardId: string }>();
  const cardId = params.cardId as Hex;
  const { busy, error, runOwnerAction } = useOwner();

  const [stored, setStored] = useState<StoredCard>();
  const [state, setState] = useState<CardState | null>(null);
  const [attestations, setAttestations] = useState<Attestation[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [outcomes, setOutcomes] = useState<Record<string, TaskOutcome>>({});
  const [running, setRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cap, setCap] = useState(50);
  const [purpose, setPurpose] = useState("");
  /** Velocity rule while editing: attempts allowed per minute, 0 for none. */
  const [burst, setBurst] = useState(0);
  const [picked, setPicked] = useState<Address[]>([]);
  /** The policy version in force before the last edit, so a stale authorisation can be shown failing. */
  const [staleVersion, setStaleVersion] = useState<number>();
  const [showConnect, setShowConnect] = useState(false);
  const [origin, setOrigin] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const next = await loadCardState(cardId).catch(() => null);
    setState(next);
    if (next) setAttestations(await loadAttestations(next.agentId).catch(() => []));
  }, [cardId]);

  useEffect(() => {
    setStored(getCard(cardId));
    void refresh().finally(() => setLoaded(true));
  }, [cardId, refresh]);

  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  const say = (...next: Line[]) => setLines((prev) => [...prev, ...next]);

  /** Where and how fast the chain recorded an attempt, linked to the explorer. */
  const settled = (r: RelayResult) =>
    line("chain", `Recorded on Monad in ${fmtSettle(r.settleMs)} · block #${r.blockNumber}`, "note", txUrl(r.hash));

  /** One pass over the agent's goal list, reacting to whatever the chain says. */
  async function run() {
    if (!stored || !state) return;
    setRunning(true);
    setLines([]);
    setOutcomes({});
    const results: Record<string, TaskOutcome> = {};

    try {
      say(line("agent", `${stored.agentName} here. ${TASKS.length} things to pay for today. Checking what this card allows.`));
      const fresh = await loadCardState(cardId);
      if (!fresh) throw new Error("card not found");
      say(
        line(
          "chain",
          `Card ${last4(stored.agentAddress)}: ${fmtUsd(fresh.remaining)} of ${fmtUsd(fresh.dailyCap)} left today, ${stored.merchants.length} merchant(s) allowed.`,
        ),
      );

      let remainingUsd = Number(fresh.remaining) / 1e6;
      let policyVersion = fresh.policyVersion;

      for (const task of TASKS) {
        say(intendLine(task));

        // The agent only ever signs. A relayer submits and pays the gas, including on refusal.
        const signed = await signSpend({
          cardId,
          agentPrivateKey: stored.agentPrivateKey,
          merchants: stored.merchants,
          merchant: task.merchant,
          amountUsd: task.amountUsd,
          policyVersion,
        });
        // The goal goes along as the memo, so the relayer can check it against the card's purpose.
        const result = await relay(signed, "", { memo: task.goal });
        const ok = result.ok;

        if (result.pending) {
          const hold = held(task, result.reason ?? "");
          say(settled(result), ...hold.lines);
          results[task.id] = hold.outcome;
          setOutcomes({ ...results });
          const after = await loadCardState(cardId);
          if (after) policyVersion = after.policyVersion;
          continue;
        }

        const verdict = decide(task, ok, result.reason, remainingUsd);
        say(settled(result), ...verdict.lines);
        results[task.id] = verdict.outcome;
        setOutcomes({ ...results });

        saveAttempt({
          id: `${cardId}-${signed.auth.nonce}`,
          cardId,
          agentAddress: stored.agentAddress,
          agentName: stored.agentName,
          merchant: task.merchant,
          amountUsd: task.amountUsd,
          ok,
          reason: result.reason,
          hash: result.hash,
          at: Date.now(),
          task: task.goal,
          settleMs: result.settleMs,
        });

        if (ok) remainingUsd = Math.max(remainingUsd - task.amountUsd, 0);
        if (verdict.stopRun) {
          for (const rest of TASKS.slice(TASKS.indexOf(task) + 1)) results[rest.id] = "skipped";
          setOutcomes({ ...results });
          break;
        }
        const after = await loadCardState(cardId);
        if (after) policyVersion = after.policyVersion;
      }

      say(summarise(results));
      await refresh();
    } catch (err) {
      say(line("chain", err instanceof Error ? err.message : String(err), "declined"));
    } finally {
      setRunning(false);
    }
  }

  const openEdit = () => {
    if (!state || !stored) return;
    setCap(Number(state.dailyCap) / 1e6);
    setPicked([...stored.merchants]);
    setPurpose(state.purpose);
    setBurst(state.maxBurst);
    setEditing(true);
  };

  /** Owner action: lift a velocity freeze. */
  const unfreeze = () =>
    runOwnerAction("Unfreezing the card", async (wallet) => {
      const hash = await wallet.writeContract({
        address: ADDRESSES.spendRouter,
        abi: spendRouterAbi,
        functionName: "unfreeze",
        args: [cardId],
        account: wallet.account!,
        chain,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      say(line("chain", "Unfrozen by the owner. The burst count starts again.", "note", txUrl(hash)));
      await refresh();
    });

  /**
   * The runaway loop, on purpose: the agent repeats a $1 payment until the card's velocity
   * rule trips and the chain freezes the card. Each attempt is submitted as-is (no escalation),
   * so every one is recorded.
   */
  async function runaway() {
    if (!stored || !state || state.maxBurst === 0) return;
    setRunning(true);
    try {
      const merchant = stored.merchants[0] ?? MERCHANTS[0].address;
      say(
        line(
          "agent",
          `Something has gone wrong in my loop: I am paying ${merchantName(merchant)} $1, again and again.`,
          "note",
        ),
      );
      for (let i = 1; i <= state.maxBurst + 2; i++) {
        const signed = await signSpend({
          cardId,
          agentPrivateKey: stored.agentPrivateKey,
          merchants: stored.merchants,
          merchant,
          amountUsd: 1,
          policyVersion: state.policyVersion,
        });
        const result = await relay(signed, "", { memo: "Retrying the same $1 charge", escalate: false });
        say(
          line(
            "chain",
            `Attempt ${i}: ${result.ok ? "paid $1" : `refused, ${result.reason}`} · ${fmtSettle(result.settleMs)}`,
            result.ok ? "ok" : "declined",
            txUrl(result.hash),
          ),
        );
        saveAttempt({
          id: `${cardId}-${signed.auth.nonce}`,
          cardId,
          agentAddress: stored.agentAddress,
          agentName: stored.agentName,
          merchant,
          amountUsd: 1,
          ok: result.ok,
          reason: result.reason,
          hash: result.hash,
          at: Date.now(),
          task: "Runaway loop",
          settleMs: result.settleMs,
        });
        if (result.reason === "VelocityExceeded" || result.reason === "CardFrozen") {
          say(
            line(
              "chain",
              `The card froze itself: more than ${state.maxBurst} attempts inside ${state.burstWindow} seconds. Nothing more can be paid until the owner unfreezes it.`,
              "declined",
            ),
          );
          break;
        }
      }
      await refresh();
    } catch (err) {
      say(line("chain", err instanceof Error ? err.message : String(err), "declined"));
    } finally {
      setRunning(false);
    }
  }

  /**
   * Owner-signed policy change, in one passkey prompt. New limits bump policyVersion, which
   * voids everything signed under the old one; the purpose and velocity rule are not part of
   * what the agent signs, so changing only those does not.
   */
  const saveLimits = () =>
    runOwnerAction("Updating the card", async (wallet) => {
      if (!state || !stored) return;
      const sameMerchants =
        picked.length === stored.merchants.length &&
        picked.every((m) => stored.merchants.some((x) => x.toLowerCase() === m.toLowerCase()));
      const limitsChanged = cap !== Number(state.dailyCap) / 1e6 || !sameMerchants;
      const rulesChanged = purpose.trim() !== state.purpose || burst !== state.maxBurst;

      if (limitsChanged) {
        const before = state.policyVersion;
        const hash = await wallet.writeContract({
          address: ADDRESSES.cardManager,
          abi: cardManagerAbi,
          functionName: "updatePolicy",
          args: [cardId, BigInt(cap) * 1_000_000n, merchantRoot(picked), BigInt(state.validUntil)],
          account: wallet.account!,
          chain,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        const next = { ...stored, merchants: picked, dailyCapUsd: cap };
        saveCard(next);
        setStored(next);
        setStaleVersion(before);
        say(
          line(
            "chain",
            `Policy updated to version ${before + 1}: $${cap} a day, ${picked.length === 0 ? "any merchant" : `${picked.length} merchant(s)`}. Anything signed under version ${before} is now void.`,
            "note",
            txUrl(hash),
          ),
        );
      }
      if (rulesChanged) {
        const hash = await wallet.writeContract({
          address: ADDRESSES.cardManager,
          abi: cardManagerAbi,
          functionName: "setRules",
          args: [cardId, burst, burst ? BURST_WINDOW_S : 0, purpose.trim()],
          account: wallet.account!,
          chain,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        say(
          line(
            "chain",
            `Rules updated: ${burst ? `freezes after ${burst} attempts a minute` : "no velocity rule"}; purpose "${purpose.trim() || "not stated"}".`,
            "note",
            txUrl(hash),
          ),
        );
      }
      setEditing(false);
      await refresh();
    });

  /** The agent signs under the superseded policy version, and the chain refuses it. */
  async function tryStale() {
    if (!stored || !state || staleVersion === undefined) return;
    setRunning(true);
    try {
      const merchant = stored.merchants[0] ?? MERCHANTS[0].address;
      say(
        line(
          "agent",
          `Authorising $5 to ${merchantName(merchant)} with an authorisation signed under the old policy, version ${staleVersion}.`,
        ),
      );
      const signed = await signSpend({
        cardId,
        agentPrivateKey: stored.agentPrivateKey,
        merchants: stored.merchants,
        merchant,
        amountUsd: 5,
        policyVersion: staleVersion,
      });
      const result = await relay(signed);
      say(
        settled(result),
        result.ok
          ? line("chain", "Approved.", "ok")
          : line("chain", `Refused: ${result.reason}.`, "declined"),
        line(
          "agent",
          result.reason === "PolicyVersionStale"
            ? "Understood: the owner changed the rules, so anything I signed under the old ones no longer counts. I will re-sign under the current policy."
            : "That was not the refusal I expected; leaving it for the owner.",
          "note",
        ),
      );
      saveAttempt({
        id: `${cardId}-${signed.auth.nonce}`,
        cardId,
        agentAddress: stored.agentAddress,
        agentName: stored.agentName,
        merchant,
        amountUsd: 5,
        ok: result.ok,
        reason: result.reason,
        hash: result.hash,
        at: Date.now(),
        task: "Stale authorisation",
        settleMs: result.settleMs,
      });
      setStaleVersion(undefined);
      await refresh();
    } catch (err) {
      say(line("chain", err instanceof Error ? err.message : String(err), "declined"));
    } finally {
      setRunning(false);
    }
  }

  const revoke = () =>
    runOwnerAction("Revoking the card", async (wallet) => {
      const hash = await wallet.writeContract({
        address: ADDRESSES.cardManager,
        abi: cardManagerAbi,
        functionName: "revoke",
        args: [cardId],
        account: wallet.account!,
        chain,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh();
    });

  if (loaded && !state) {
    return (
      <Shell title="Card not found" subtitle="This card does not exist on-chain.">
        <Panel>
          <Empty title="Nothing here">
            <Link href="/cards">
              <Button>Back to cards</Button>
            </Link>
          </Empty>
        </Panel>
      </Shell>
    );
  }

  const attempts = listAttempts(cardId);
  const status = state?.revoked ? "revoked" : state?.expired ? "expired" : state?.frozen ? "frozen" : "active";

  return (
    <Shell
      title={stored ? `${stored.agentName}'s card` : "Card"}
      subtitle={stored ? `${stored.persona}. ${AGENT.brief}` : undefined}
      action={
        state && !state.revoked ? (
          <Button variant="destructive" onClick={revoke} disabled={!!busy || running}>
            {busy ?? "Revoke card"}
          </Button>
        ) : undefined
      }
    >
      <div className={p.stack}>
        {error && (
          <Notice tone="error" title="That did not go through">
            {error}
          </Notice>
        )}
        {state?.revoked && (
          <Notice title="This card is revoked">
            Every future payment fails at the policy check. Revocation is permanent — issue a new
            card if the agent still needs to spend.
          </Notice>
        )}

        {state?.frozen && !state.revoked && (
          <Notice tone="error" title="Frozen by the velocity rule">
            The agent tried to pay more than {state.maxBurst} times inside {state.burstWindow} seconds, so the
            chain froze this card. Nothing can be paid until you unfreeze it.{" "}
            <button className={u.linkBtn} onClick={unfreeze} disabled={!!busy}>
              {busy ?? "Unfreeze with passkey"}
            </button>
          </Notice>
        )}

        <div className={p.grid2}>
          <div className={p.stack}>
            {stored && state && (
              <AgentCardFace
                last4={last4(stored.agentAddress)}
                agentName={stored.agentName}
                persona={stored.persona}
                dailyCap={state.dailyCap}
                remaining={state.remaining}
                revoked={state.revoked}
                expired={state.expired}
                frozen={state.frozen}
                merchantCount={stored.merchants.length}
              />
            )}

            <Panel
              title="Policy"
              action={
                state && !state.revoked && !state.expired && !editing ? (
                  <Button variant="ghost" onClick={openEdit} disabled={!!busy || running}>
                    Edit card
                  </Button>
                ) : undefined
              }
            >
              {state && editing && (
                <>
                  <label className={p.field}>
                    <span className={p.fieldLabel}>
                      <span>Daily limit</span>
                      <strong>${cap}</strong>
                    </span>
                    <input
                      type="range"
                      min={10}
                      max={200}
                      step={10}
                      value={cap}
                      onChange={(e) => setCap(Number(e.target.value))}
                      className={u.fullRange}
                    />
                  </label>
                  <div className={p.field}>
                    <span className={p.fieldLabel}>
                      <span>Allowed merchants</span>
                      <span>{picked.length === 0 ? "any merchant" : `${picked.length} selected`}</span>
                    </span>
                    {MERCHANTS.map((m) => {
                      const on = picked.some((x) => x.toLowerCase() === m.address.toLowerCase());
                      return (
                        <label key={m.address} className={`${p.check} ${on ? p.checkOn : ""}`}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) =>
                              setPicked((prev) =>
                                e.target.checked
                                  ? [...prev, m.address]
                                  : prev.filter((x) => x.toLowerCase() !== m.address.toLowerCase()),
                              )
                            }
                          />
                          <span className={`${p.avatarSm} ${tintClass(m.tintIndex)}`}>{m.initials}</span>
                          <span>
                            <span className={u.strong}>{m.name}</span>
                            <span className={p.merchantSellsBlock}>{m.sells}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <RuleFields purpose={purpose} onPurpose={setPurpose} burst={burst} onBurst={setBurst} />
                  <p className={u.lead}>
                    New limits bump the policy version: every authorisation the agent signed under the
                    current version stops working at once.
                  </p>
                  <div className={p.btnRow}>
                    <Button variant="primary" onClick={saveLimits} disabled={!!busy}>
                      {busy ?? "Save changes"}
                    </Button>
                    <Button variant="ghost" onClick={() => setEditing(false)} disabled={!!busy}>
                      Cancel
                    </Button>
                  </div>
                </>
              )}
              {state && !editing && (
                <>
                  <DataRow label="Status" value={<StatusBadge kind={status as "active"} />} />
                  <DataRow label="Daily limit" value={fmtUsd(state.dailyCap)} />
                  <DataRow label="Remaining today" value={state.revoked ? "—" : fmtUsd(state.remaining)} />
                  <DataRow
                    label="Merchants"
                    value={
                      stored?.merchants.length
                        ? stored.merchants.map((m) => merchantName(m)).join(", ")
                        : "any merchant"
                    }
                  />
                  <DataRow label="For" value={state.purpose || "Not stated"} />
                  <DataRow
                    label="Velocity rule"
                    value={
                      state.maxBurst
                        ? `Freezes after ${state.maxBurst} attempts in ${state.burstWindow} seconds`
                        : "None"
                    }
                  />
                  <DataRow label="Expires" value={new Date(state.validUntil * 1000).toLocaleDateString()} />
                  <DataRow label="Agent key" value={<AddressLink address={state.agentKey} />} />
                  <DataRow label="ERC-8004 identity" value={`#${state.agentId}`} />
                  <DataRow label="Policy version" value={`v${state.policyVersion}`} />
                  {staleVersion !== undefined && !state.revoked && (
                    <div className={u.mt4}>
                      <Button variant="secondary" onClick={tryStale} disabled={running || !!busy}>
                        Try an authorisation signed under v{staleVersion}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Panel>
          </div>

          <Panel
            title={`${stored?.agentName ?? AGENT.name}'s run`}
            note="The agent picks its own amounts and merchants, and decides what to do about each refusal."
            action={
              <Button variant="primary" onClick={run} disabled={running || !!busy || !state}>
                {running ? "Running…" : lines.length ? "Run again" : `Start ${stored?.agentName ?? AGENT.name}`}
              </Button>
            }
          >
            <div className={`${p.taskList} ${u.mb4}`}>
              {TASKS.map((t) => {
                const o = outcomes[t.id];
                return (
                  <div key={t.id} className={p.task}>
                    <span className={u.grow}>
                      <span className={p.taskGoal}>{t.goal}</span>
                      <span className={`${p.taskMeta} ${u.displayBlock}`}>
                        ${t.amountUsd} · {t.merchantName}
                      </span>
                    </span>
                    {o === "done" && <StatusBadge kind="approved" label="Paid" />}
                    {o === "deferred" && <StatusBadge kind="pending" label="Deferred" />}
                    {o === "blocked" && <StatusBadge kind="declined" label="Blocked" />}
                    {o === "halted" && <StatusBadge kind="revoked" label="Stopped" />}
                    {o === "skipped" && <StatusBadge kind="expired" label="Skipped" />}
                    {o === "awaiting" && <StatusBadge kind="pending" label="Awaiting you" />}
                    {!o && running && <StatusBadge kind="pending" label="Queued" />}
                  </div>
                );
              })}
            </div>

            {lines.length === 0 ? (
              <Empty title="Not started">
                {stored?.agentName ?? AGENT.name} has {TASKS.length} payments to make. One fits the card, one is over the
                limit, one is at a merchant this card does not allow.
              </Empty>
            ) : (
              <div className={p.transcript} ref={logRef}>
                {lines.map((l, i) => (
                  <div key={i} className={p.line}>
                    <span className={p.who}>{l.who === "agent" ? (stored?.agentName ?? AGENT.name) : "chain"}</span>
                    <span className={l.tone === "ok" ? p.lineOk : l.tone === "declined" ? p.lineDeclined : l.tone === "note" ? p.lineNote : undefined}>
                      {l.text}
                      {l.href && (
                        <>
                          {" "}
                          <a href={l.href} target="_blank" rel="noreferrer">
                            view
                          </a>
                        </>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {state && state.maxBurst > 0 && !state.frozen && !state.revoked && (
              <div className={`${p.rowBetween} ${u.mt4}`}>
                <span className={u.sub}>
                  Watch the velocity rule work: the agent repeats a $1 payment until the card freezes.
                </span>
                <Button variant="ghost" onClick={runaway} disabled={running || !!busy}>
                  Simulate a runaway loop
                </Button>
              </div>
            )}
          </Panel>
        </div>

        {state && !state.revoked && (
          <Panel
            title="Waiting for your approval"
            note="Payments this card would not make on its own wait here instead of failing. Approve with your passkey, or decline."
          >
            <ApprovalInbox
              cardIds={[cardId]}
              emptyText="Nothing waiting. A payment over the limit, at a merchant off the list, or off the card's purpose will appear here."
              onSettled={refresh}
            />
          </Panel>
        )}

        {stored && state && !state.revoked && (
          <Panel
            title="Connect an agent"
            note="Give Claude, or any MCP client, this card. It receives the card's agent key, not yours: it can sign payments within these limits and nothing else, and revoking the card disables it."
            action={
              <Button variant="ghost" onClick={() => setShowConnect((v) => !v)}>
                {showConnect ? "Hide" : "Show connection command"}
              </Button>
            }
          >
            {showConnect ? (
              <div className={p.merchantKit}>
                <Snippet
                  label="1 · Get the Darc MCP server"
                  text="git clone https://github.com/Abdol164/Darc ~/Darc && cd ~/Darc && npm install"
                />
                <Snippet
                  label="2 · Add it to Claude Code"
                  text={[
                    "claude mcp add darc",
                    `-e DARC_URL=${origin}`,
                    `-e DARC_CARD_ID=${cardId}`,
                    `-e DARC_AGENT_KEY=${stored.agentPrivateKey}`,
                    `-e DARC_MERCHANTS=${stored.merchants.join(",")}`,
                    "-- node $HOME/Darc/mcp/server.ts",
                  ].join(" ")}
                />
                <Snippet
                  label="3 · Then ask"
                  text={`Check your Darc card, then pay Lagos Cloud Hosting $20 for this month's hosting and Horizon Data API $200 for API credits.`}
                />
                <p className={u.leadTight}>
                  Other MCP clients run <code>node ~/Darc/mcp/server.ts</code> with the same four
                  environment variables. Every payment it makes shows up in this card&apos;s record.
                </p>
              </div>
            ) : (
              <p className={u.leadTight}>
                The command contains this card&apos;s agent key, so it stays hidden until you ask.
              </p>
            )}
          </Panel>
        )}

        <Panel
          title="On-chain record for this card"
          note="Written by the merchants to the ERC-8004 reputation registry. We cannot write it: the registry rejects feedback from whoever holds the agent's identity, which is our own contract."
          action={<Link href="/activity">All activity</Link>}
          flush
        >
          {attestations.length === 0 ? (
            <Empty title="No attempts yet">Start the agent to create a record.</Empty>
          ) : (
            <Table head={["Merchant", "Result", "Reason", "Amount", "Transaction"]}>
              {attestations.map((a, i) => {
                const local = attempts.find((x) => x.merchant.toLowerCase() === a.client.toLowerCase() && (a.verdict === "approved") === x.ok);
                return (
                  <tr key={`${a.client}-${a.index}`} className={a.verdict === "approved" ? u.railOk : u.railNo}>
                    <td>
                      <MerchantCell address={a.client} />
                    </td>
                    <td>
                      {a.verdict === "approved" ? <StatusBadge kind="approved" /> : <StatusBadge kind="declined" />}
                    </td>
                    <td className={a.verdict === "approved" ? u.dim : u.danger}>
                      {a.reason === "approved" ? "—" : a.reason}
                    </td>
                    <td className={u.cellMonoMuted}>
                      {local ? `$${local.amountUsd}` : "—"}
                    </td>
                    <td>{local?.hash ? <a href={txUrl(local.hash)} target="_blank" rel="noreferrer">view</a> : <span className={u.dim}>—</span>}</td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Panel>
      </div>
    </Shell>
  );
}
