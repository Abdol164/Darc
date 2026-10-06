"use client";

/**
 * Sign in — a passkey ceremony with a stage beside it.
 *
 * Left: the cobalt stage, which says what Darc does while it moves (orbiting rings, a cycling
 * word, a floating card, a sample run writing itself). Right: the paper side, where the two
 * real ways in are offered: sign in with an existing passkey, or create one. There is no
 * password, wallet or SSO path, so none is shown.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Notice } from "@/components/ui";
import { AddressLink } from "@/components/pieces";
import { Mark } from "@/components/brand";
import { RotatingWord } from "@/components/rotating-word";
import { ADDRESSES } from "@/lib/contracts";
import { useOwner } from "@/lib/owner-context";
import s from "./sign-in.module.css";

type Mode = "signIn" | "create";

const WORDS = ["budget", "daily limit", "merchant list", "spending"] as const;

/** The demo agent's three goals on a $50 card, as the live run records them. */
const RUN = [
  { ok: true, text: "Lagos Cloud Hosting · $20 · paid" },
  { ok: false, text: "Horizon Data API · $200 · held for you: over the limit" },
  { ok: false, text: "Riverside Subscriptions · $15 · held for you: not on the list" },
];

const COPY: Record<Mode, { title: [string, string]; lede: string; device: string; action: string }> = {
  signIn: {
    title: ["Sign in to the", "Ledger"],
    lede: "Use the passkey you created on this site. There is no password and no seed phrase.",
    device: "Asks for the passkey you made here",
    action: "Sign in with passkey",
  },
  create: {
    title: ["Start your", "Ledger"],
    lede: "Your device creates a passkey for this site, and your account is derived from it. The key never reaches a server.",
    device: "Creates a passkey for this site",
    action: "Create account with passkey",
  },
};

/** Writes the sample run one line at a time, holds it, then starts again. */
function useRunStep() {
  const [step, setStep] = useState(RUN.length);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setStep(0);
    let n = 0;
    const t = setInterval(() => {
      n = (n + 1) % (RUN.length + 3);
      setStep(Math.min(n, RUN.length));
    }, 1300);
    return () => clearInterval(t);
  }, []);
  return step;
}

function useUtcClock() {
  const [now, setNow] = useState<string>();
  useEffect(() => {
    const tick = () => setNow(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function SignInPage() {
  const router = useRouter();
  const { owner, signIn, busy, error, clearError } = useOwner();
  const [mode, setMode] = useState<Mode>("signIn");
  const [secure, setSecure] = useState(true);
  const step = useRunStep();
  const now = useUtcClock();
  const copy = COPY[mode];

  useEffect(() => {
    setSecure(window.isSecureContext && typeof window.PublicKeyCredential !== "undefined");
  }, []);

  // Signed in (now, or already in this tab): the overview is where the work is.
  useEffect(() => {
    if (owner) router.replace("/");
  }, [owner, router]);

  const choose = (next: Mode) => {
    setMode(next);
    clearError();
  };

  return (
    <main className={s.page}>
      {/* ---- the cobalt stage --------------------------------------------------------- */}
      <section className={s.stage}>
        <div className={s.grid} aria-hidden />
        <div className={`${s.orbit} ${s.orbitA}`} aria-hidden>
          <span className={s.ring} />
          <span className={`${s.ring} ${s.ringDash} ${s.inset1}`} />
          <span className={`${s.ring} ${s.inset2}`} />
          <span className={`${s.ring} ${s.ringDash} ${s.inset3}`} />
          <span className={`${s.ring} ${s.inset4}`} />
          <span className={`${s.node} ${s.nodeA}`} />
          <span className={`${s.node} ${s.nodeSmall} ${s.nodeB}`} />
        </div>
        <div className={`${s.orbit} ${s.orbitB}`} aria-hidden>
          <span className={s.ring} />
          <span className={`${s.ring} ${s.inset2}`} />
          <span className={`${s.ring} ${s.ringDash} ${s.inset3}`} />
          <span className={`${s.ring} ${s.inset5}`} />
          <span className={`${s.node} ${s.nodeC}`} />
        </div>
        <div className={s.glow} aria-hidden />

        <header className={s.stageTop}>
          <Link href="/" className={s.brand}>
            <Mark size={26} inverse />
            <span className={s.brandName}>Darc</span>
            <span className={s.chip}>Testnet</span>
          </Link>
          <span className={s.pill}>
            <span className={s.ping} />
            Monad Testnet
          </span>
        </header>

        <div className={s.stageBody}>
          <div className={s.kicker}>
            <span className={s.square} />
            Spending under your rules
          </div>
          <h2 className={s.stageTitle}>
            Darc controls your agent&apos;s <RotatingWord words={WORDS} />
          </h2>
          <p className={s.stageLede}>
            Give an AI agent a card with a daily limit and a short list of merchants. Every payment
            it attempts is checked on-chain before any money moves, and the verdict is public.
          </p>

          <div className={s.float}>
            <div className={s.cardWrap}>
              <div className={s.card}>
                <div className={s.cardRings} aria-hidden />
                <div className={s.cardRow}>
                  <div className={s.cardLeft}>
                    <span className={s.chipGold} />
                    <span className={s.chip}>Agent card</span>
                  </div>
                  <div className={s.cardRight}>
                    <span className={s.status}>
                      <span className={s.statusDot} />
                      Active
                    </span>
                    <span className={s.cardMeta}>$50 daily limit</span>
                  </div>
                </div>
                <div>
                  <div className={s.cardNumber}>
                    <span>•••• •••• A55A</span>
                    <span className={s.chip}>2 merchants</span>
                  </div>
                  <div className={s.cardSub}>
                    <span>Agent: Atlas</span>
                    <span>Issued by passkey</span>
                  </div>
                </div>
                <div className={s.cardFoot}>
                  <span>
                    <span className={s.tick}>✓</span> Over-limit payments refused on-chain
                  </span>
                  <span>Revocable</span>
                </div>
              </div>
            </div>
          </div>

          <div className={s.ticker}>
            <div className={s.tickerHead}>
              <span className={s.tickerTitle}>
                <span className={s.diamond}>◆</span> The record
              </span>
              <span className={s.chip}>Sample run</span>
            </div>
            <div className={s.tickerLines}>
              {RUN.map((r, i) => (
                <div key={i} className={`${s.tickerLine} ${i < step ? s.shown : ""}`}>
                  <span className={r.ok ? s.tick : s.hold}>{r.ok ? "✓" : "◷"}</span>
                  <span>{r.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <footer className={s.stageFoot}>
          <span>Passkey · WebAuthn PRF</span>
          <span>ERC-8004 identities</span>
        </footer>
      </section>

      {/* ---- the paper side ------------------------------------------------------------- */}
      <section className={s.paper}>
        <div className={s.paperTop}>
          <span className={s.online}>
            <span className={s.onlineDot} />
            Network: Monad Testnet
          </span>
          <span>
            Chain: <strong className={s.ink}>10143</strong>
          </span>
        </div>

        <div className={s.formWrap}>
          <div className={s.formKicker}>
            <span className={s.squareCobalt} />
            Passkey sign-in
          </div>
          <h1 className={s.title}>
            {copy.title[0]} <em>{copy.title[1]}</em>
          </h1>
          <p className={s.lede}>{copy.lede}</p>

          <div className={s.tabs} role="tablist" aria-label="How to get in">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signIn"}
              className={`${s.tab} ${mode === "signIn" ? s.tabOn : ""}`}
              onClick={() => choose("signIn")}
            >
              I have a passkey
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "create"}
              className={`${s.tab} ${mode === "create" ? s.tabOn : ""}`}
              onClick={() => choose("create")}
            >
              Create an account
            </button>
          </div>

          <div className={s.receipt} key={mode}>
            <div className={s.receiptRow}>
              <span className={s.receiptLabel}>Your device</span>
              <span>{copy.device}</span>
            </div>
            <div className={s.receiptRow}>
              <span className={s.receiptLabel}>This browser</span>
              <span>Derives your account key from it</span>
            </div>
            <div className={s.receiptRow}>
              <span className={s.receiptLabel}>Afterwards</span>
              <span>The key is discarded; nothing is stored</span>
            </div>
          </div>

          {!secure && (
            <div className={s.notice}>
              <Notice tone="error" title="Passkeys need a secure connection">
                Open this page over HTTPS, or on localhost, and sign-in will work.
              </Notice>
            </div>
          )}
          {error && (
            <div className={s.notice}>
              <Notice tone="error" title="We could not read your account">
                {error}
              </Notice>
            </div>
          )}

          <Button variant="primary" size="lg" block onClick={() => signIn(mode)} disabled={!!busy || !secure}>
            {busy ?? copy.action}
          </Button>

          <div className={s.divider}>
            <span>or</span>
          </div>

          <Link href="/verify" className={s.secondary}>
            Check an agent&apos;s record without signing in
          </Link>

          <div className={s.advisory}>
            <div className={s.advisoryTitle}>Passkey providers</div>
            <p>
              Darc needs a provider that supports the WebAuthn PRF extension: iCloud Keychain,
              1Password or Google Password Manager. Passkeys saved only to a desktop Chrome profile
              cannot derive an account, and sign-in will say so.
            </p>
          </div>

          <div className={s.meta}>
            <div className={s.metaRow}>
              <span>Network</span>
              <span className={s.ink}>Monad Testnet</span>
            </div>
            <div className={s.metaRow}>
              <span>Card contract</span>
              <AddressLink address={ADDRESSES.cardManager} />
            </div>
            <div className={s.metaRow}>
              <span>Account key</span>
              <span className={s.ink}>Derived here, never sent</span>
            </div>
            <div className={s.metaRow}>
              <span>Time</span>
              <span className={s.ink}>{now ?? "—"}</span>
            </div>
          </div>
        </div>

        <div className={s.paperFoot}>
          <Link href="/" className={s.back}>
            ← Back to home
          </Link>
          <span className={s.footMark}>
            <span className={s.squareCobalt} />
            Agent cards, on the record
          </span>
        </div>
      </section>
    </main>
  );
}
