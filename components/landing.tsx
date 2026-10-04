"use client";

/**
 * The landing page — what a signed-out visitor sees at `/`.
 *
 * Every figure here is a property of the deployed system (ten checks, one revoke transaction,
 * nothing held by the agent), not a traffic number, and the sample run is the one the live
 * demo produces: Atlas's three goals on a $50 card.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AgentCardFace } from "./agent-card";
import { AddressLink, Stat, pieces as p } from "./pieces";
import { Button, DataRow, Notice, Panel, StatusBadge, Table, ui as u } from "./ui";
import { Mark } from "./brand";
import { RotatingWord } from "./rotating-word";
import { MERCHANTS } from "@/config/merchants";
import { ERC8004 } from "@/config/chain";
import { ADDRESSES } from "@/lib/contracts";
import { AGENT, TASKS } from "@/lib/agent";
import { useOwner } from "@/lib/owner-context";
import l from "./landing.module.css";

const DEMO_CAP_USD = 50;

/** What each of Atlas's goals meets on a $50 card that allows the first two merchants. */
const RUN: Record<string, { ok: boolean; reason?: string }> = {
  hosting: { ok: true },
  "api-credits": { ok: false, reason: "DailyCapExceeded" },
  "data-feed": { ok: false, reason: "MerchantNotAllowed" },
};

const STEPS = [
  {
    n: "01",
    tag: "Owner · passkey",
    title: "Issue a card",
    body: "Your passkey signs one transaction that sets the daily limit, the merchant list and the expiry. The agent gets a fresh key and its own ERC-8004 identity.",
    code: "issueCard(agentKey, dailyCap, merchantRoot, validUntil)",
  },
  {
    n: "02",
    tag: "Agent · signature",
    title: "The agent asks to pay",
    body: "The agent only ever signs a payment authorisation. It holds no funds and no gas: a relayer submits the request and the contract checks it against the card.",
    code: "SpendAuth(cardId, merchant, token, amount, nonce, deadline, policyVersion)",
  },
  {
    n: "03",
    tag: "Merchant · registry",
    title: "The verdict is recorded",
    body: "Approved or refused, the merchant writes the outcome and its reason to the shared reputation registry. Anyone can read an agent's record with one call.",
    code: "reportForAgentKey(agentKey) → approved, declined, revoked",
  },
];

/** SpendGate's checks, in the order it runs them. Any one failing refuses the payment. */
const CHECKS = [
  ["The card exists", "CardNotFound"],
  ["It has not been revoked", "CardRevoked"],
  ["It has not expired", "CardExpired"],
  ["The request is still fresh", "DeadlineExpired"],
  ["It pays in the card's token", "TokenNotAllowed"],
  ["It was signed under the current policy", "PolicyVersionStale"],
  ["The card's agent key signed it", "BadAgentSignature"],
  ["The request has not been used before", "NonceUsed"],
  ["The merchant is on the card's list", "MerchantNotAllowed"],
  ["It fits within today's limit", "DailyCapExceeded"],
] as const;

const CTA_WORDS = ["budget", "daily limit", "merchant list", "spending"] as const;

/**
 * Plays a block's entrance once, when it scrolls into view. Until then the block is "armed"
 * (held at its starting frame) — but only once JavaScript is running and motion is allowed,
 * so without either the content simply shows.
 */
function useEntrance<T extends Element>(threshold = 0.35) {
  const ref = useRef<T>(null);
  const [state, setState] = useState<"idle" | "armed" | "live">("idle");
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setState("armed");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState("live");
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, state] as const;
}

export function Landing() {
  const { signIn, busy, error } = useOwner();
  const allowed = [MERCHANTS[0], MERCHANTS[1]];
  const [recordRef, recordState] = useEntrance<HTMLDivElement>();
  const [checksRef, checksState] = useEntrance<HTMLDivElement>(0.4);
  const phase = (s: typeof recordState) => (s === "armed" ? l.armed : s === "live" ? l.live : "");

  const create = () => signIn("create");
  const returning = () => signIn("signIn");

  return (
    <div className={l.page}>
      {/* ---- the opening, written on ledger paper ---------------------------------- */}
      <section className={l.hero}>
        <div className={l.ruled} aria-hidden />
        <div className={l.heroBody}>
          <div className={`${l.stampRow} ${l.in} ${l.d1}`}>
            <span className={l.stamp}>
              <span className={l.liveDot} />
              Live on Monad Testnet
            </span>
            <span className={l.folio}>Chain 10143 · ERC-8004 identities</span>
          </div>

          <h1 className={`${l.title} ${l.in} ${l.d2}`}>
            The notarised ledger for <em>AI agent</em> spending.
          </h1>
          <p className={`${l.lede} ${l.in} ${l.d3}`}>
            Darc gives an AI agent a card with a daily limit and a short list of merchants. Every
            payment it attempts, approved or refused, is written on-chain where anyone can check it.
          </p>

          <div className={`${l.actions} ${l.in} ${l.d4}`}>
            <Button variant="primary" size="lg" onClick={create} disabled={!!busy}>
              {busy ?? "Create an account"}
            </Button>
            <Button variant="secondary" size="lg" onClick={returning} disabled={!!busy}>
              I already have one
            </Button>
            <Link href="/verify" className={l.textLink}>
              Check an agent&apos;s record →
            </Link>
          </div>
          <p className={`${l.fine} ${l.in} ${l.d5}`}>Passkey sign-in · no seed phrase · no password</p>

          {error && (
            <div className={l.error}>
              <Notice tone="error" title="We could not read your account">
                {error}
              </Notice>
            </div>
          )}

          <div className={`${p.stats} ${l.facts} ${l.in} ${l.d6}`}>
            <Stat label="Checks on every payment" value="10" note="each refusal names its reason" />
            <Stat label="Transactions to revoke" value="1" note="permanent from the next block" />
            <Stat label="Held by the agent" value="$0" note="it signs; it never holds funds or gas" />
            <Stat label="Settles in" value="AUSD" note="Agora's dollar stablecoin, not a mock" />
          </div>
        </div>
      </section>

      {/* ---- the card and its record, side by side ------------------------------------ */}
      <section className={l.band}>
        <div className={l.stage}>
          <div className={l.column}>
            <div className={l.kicker}>
              <span className={l.square} />
              The card
            </div>
            <div className={l.cardStage}>
              <div className={l.rings} aria-hidden>
                <span />
                <span />
                <span />
              </div>
              <div className={l.floating}>
                <AgentCardFace
                  last4="A55A"
                  agentName={AGENT.name}
                  persona={AGENT.persona}
                  dailyCap={BigInt(DEMO_CAP_USD) * 1_000_000n}
                  remaining={30_000_000n}
                  revoked={false}
                  merchantCount={allowed.length}
                />
              </div>
            </div>
            <Panel title="Policy" action={<StatusBadge kind="active" />}>
              <DataRow label="Daily limit" value={`$${DEMO_CAP_USD}, refused on-chain above it`} />
              <DataRow label="Merchants" value={allowed.map((m) => m.name).join(", ")} />
              <DataRow label="Valid for" value="30 days from issue" />
              <DataRow label="Revocation" value="One owner action, permanent" />
            </Panel>
          </div>

          <div className={l.column}>
            <div className={l.kicker}>
              <span className={`${l.square} ${l.squareOk}`} />
              The record
            </div>
            <div ref={recordRef} className={`${l.record} ${phase(recordState)}`}>
              <Panel
                flush
                title={`${AGENT.name}'s first run`}
                note={`Three goals on a $${DEMO_CAP_USD} card. These are the outcomes the live demo produces on Monad Testnet.`}
              >
                <Table head={["Goal", "Amount", "Verdict"]}>
                  {TASKS.map((t) => {
                    const v = RUN[t.id];
                    return (
                      <tr key={t.id} className={v.ok ? u.railOk : u.railNo}>
                        <td>
                          <span className={l.goal}>{t.goal}</span>
                          <span className={l.goalAt}>at {t.merchantName}</span>
                        </td>
                        <td className={`${u.cellMono} ${v.ok ? "" : l.struck}`}>${t.amountUsd}</td>
                        <td>
                          {v.ok ? <StatusBadge kind="approved" label="Paid" /> : <StatusBadge kind="declined" label={v.reason} />}
                        </td>
                      </tr>
                    );
                  })}
                </Table>
                <p className={l.tableFoot}>
                  Refused amounts never move. Each verdict is written to the reputation registry by
                  the merchant, so Darc cannot edit its own agents&apos; record.
                </p>
              </Panel>
            </div>
          </div>
        </div>
      </section>

      {/* ---- how it works: a real sequence, so it is numbered ---------------------------- */}
      <section className={l.section}>
        <header className={`${l.sectionHead} ${l.reveal}`}>
          <div>
            <div className={l.kicker}>How it works</div>
            <h2 className={l.h2}>Three steps, one public record</h2>
          </div>
          <p className={l.sectionNote}>
            The owner sets the rules once. The agent can only ask. The chain decides, and the
            answer stays where anyone can read it.
          </p>
        </header>
        <div className={l.steps}>
          {STEPS.map((s) => (
            <Panel key={s.n} className={`${l.step} ${l.reveal}`}>
              <div className={l.stepTop}>
                <span className={l.stepNo}>{s.n}</span>
                <span className={l.stepTag}>{s.tag}</span>
              </div>
              <h3 className={l.h3}>{s.title}</h3>
              <p className={l.stepBody}>{s.body}</p>
              <code className={l.code}>{s.code}</code>
            </Panel>
          ))}
        </div>
      </section>

      {/* ---- the ten checks ---------------------------------------------------------------- */}
      <section className={l.section}>
        <header className={`${l.sectionHead} ${l.reveal}`}>
          <div>
            <div className={l.kicker}>What every payment passes</div>
            <h2 className={l.h2}>
              Ten checks, in order. <em>Any one</em> refuses.
            </h2>
          </div>
          <p className={l.sectionNote}>
            A refusal is not a silent failure. It is recorded with the name of the check that
            stopped it, so &ldquo;declined&rdquo; always says why.
          </p>
        </header>
        <div ref={checksRef} className={`${l.checks} ${phase(checksState)}`}>
          <Panel flush>
            <Table head={["#", "Check", "Refusal reason"]}>
              {CHECKS.map(([check, reason], i) => (
                <tr key={reason}>
                  <td className={u.cellMonoMuted}>{String(i + 1).padStart(2, "0")}</td>
                  <td>{check}</td>
                  <td className={u.cellMonoDanger}>{reason}</td>
                </tr>
              ))}
            </Table>
          </Panel>
        </div>
      </section>

      {/* ---- the closing call ---------------------------------------------------------------- */}
      <section className={l.section}>
        <Panel className={`${l.cta} ${l.reveal}`}>
          <div className={l.ctaBody}>
            <div className={l.ctaText}>
              <div className={l.kicker}>
                <span className={l.square} />
                Start on testnet
              </div>
              <h2 className={l.h2}>
                Put your agent&apos;s{" "}
                <span className={l.accent}>
                  <RotatingWord words={CTA_WORDS} />
                </span>{" "}
                on the record.
              </h2>
              <p className={l.sectionNote}>
                Create an account with a passkey, claim test AUSD from the public faucet, and issue
                {" "}{AGENT.name} a card. Then watch it work through its goals and get refused when it
                oversteps.
              </p>
            </div>
            <div className={l.ctaActions}>
              <Button variant="primary" size="lg" onClick={create} disabled={!!busy}>
                {busy ?? "Create an account"}
              </Button>
              <Link href="/verify" className={l.textLink}>
                Or check an agent&apos;s record →
              </Link>
            </div>
          </div>
          <div className={l.ctaFoot}>
            <span>Monad Testnet · chain 10143</span>
            <span>Contracts verified on Sourcify</span>
          </div>
        </Panel>
      </section>

      {/* ---- footer ---------------------------------------------------------------------------- */}
      <footer className={l.footer}>
        <div className={l.footBrand}>
          <Mark size={22} />
          <div>
            <div className={l.footName}>Darc</div>
            <div className={l.footLine}>Spending cards for AI agents, on the record.</div>
          </div>
        </div>
        <div className={l.footLinks}>
          <Link href="/verify">Verify an agent</Link>
          <AddressLink address={ADDRESSES.cardManager} label="Card contract" />
          <AddressLink address={ERC8004.reputationRegistry} label="Reputation registry" />
          <span className={l.network}>
            <span className={l.liveDot} />
            Monad Testnet
          </span>
        </div>
      </footer>
    </div>
  );
}
