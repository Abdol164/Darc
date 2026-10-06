"use client";

/** Home — the landing page when signed out; the overview, real numbers first, once signed in. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { Button, Empty, Panel, StatusBadge, Table, ui as u } from "@/components/ui";
import { AgentCardFace } from "@/components/agent-card";
import { Landing } from "@/components/landing";
import { MerchantCell, Stat, pieces as p } from "@/components/pieces";
import { PlusIcon } from "@/components/icons";
import { AGENT } from "@/lib/agent";
import { last4, listAttempts, listCards, type StoredCard } from "@/lib/cards";
import { fmtUsd, loadCardState, type CardState } from "@/lib/chain";
import { useOwner } from "@/lib/owner-context";

export default function HomePage() {
  const { owner } = useOwner();
  const [cards, setCards] = useState<{ stored: StoredCard; state: CardState | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const stored = listCards(owner);
    const withState = await Promise.all(
      stored.map(async (s) => ({ stored: s, state: await loadCardState(s.cardId).catch(() => null) })),
    );
    setCards(withState);
    setLoading(false);
  }, [owner]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = cards.filter((c) => c.state && !c.state.revoked && !c.state.expired);
  const attempts = listAttempts();
  const today = attempts.filter((a) => a.at > Date.now() - 86_400_000);
  const approvedToday = today.filter((a) => a.ok).length;
  const declinedToday = today.filter((a) => !a.ok).length;
  const recent = attempts.slice(0, 5);
  const featured = active[0] ?? cards[0];

  if (!owner) {
    return (
      <Shell landing>
        <Landing />
      </Shell>
    );
  }

  return (
    <Shell
      title="Overview"
      subtitle={`Signed in as ${owner.slice(0, 6)}…${owner.slice(-4)}.`}
      action={
        <Link href="/cards">
          <Button variant="primary">
            <PlusIcon /> Issue a card
          </Button>
        </Link>
      }
    >
      <div className={p.stack}>
        <div className={p.stats}>
          <Stat label="Active cards" value={loading ? "—" : active.length} note={`${cards.length} issued in total`} />
          <Stat label="Approved today" value={approvedToday} note="payments that went through" />
          <Stat label="Refused today" value={declinedToday} note="blocked by policy" />
          <Stat
            label="Remaining today"
            value={featured?.state ? fmtUsd(featured.state.remaining) : "—"}
            note={featured ? `of ${featured.state ? fmtUsd(featured.state.dailyCap) : "—"} on ${featured.stored.agentName}` : "no card yet"}
          />
        </div>

        {cards.length === 0 ? (
          <Panel>
            <Empty title="No cards yet">
              <p className={u.narrow}>
                Issue one to {AGENT.name}, then watch it work through its tasks and get refused when
                it oversteps.
              </p>
              <Link href="/cards">
                <Button variant="primary">Issue the first card</Button>
              </Link>
            </Empty>
          </Panel>
        ) : (
          <div className={p.grid2}>
            {featured && (
              <Panel title="Your card" action={<Link href={`/cards/${featured.stored.cardId}`}>Open</Link>}>
                <Link href={`/cards/${featured.stored.cardId}`} className={p.cardLink}>
                  <AgentCardFace
                    last4={last4(featured.stored.agentAddress)}
                    agentName={featured.stored.agentName}
                    persona={featured.stored.persona}
                    dailyCap={featured.state?.dailyCap ?? BigInt(featured.stored.dailyCapUsd) * 1_000_000n}
                    remaining={featured.state?.remaining}
                    revoked={featured.state?.revoked ?? false}
                    expired={featured.state?.expired}
                  frozen={featured.state?.frozen}
                    merchantCount={featured.stored.merchants.length}
                  />
                </Link>
              </Panel>
            )}

            <Panel
              title="Recent activity"
              note="The on-chain record of every attempt this agent made."
              action={<Link href="/activity">View all</Link>}
              flush
            >
              {recent.length === 0 ? (
                <Empty title="Nothing yet">Run the agent from its card to see attempts here.</Empty>
              ) : (
                <Table head={["Merchant", "Amount", "Result"]}>
                  {recent.map((a) => (
                    <tr key={a.id} className={a.ok ? u.railOk : u.railNo}>
                      <td>
                        <MerchantCell address={a.merchant} />
                      </td>
                      <td className={u.cellMono}>${a.amountUsd}</td>
                      <td>
                        {a.ok ? <StatusBadge kind="approved" /> : <StatusBadge kind="declined" label={a.reason ?? "Declined"} />}
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
            </Panel>
          </div>
        )}
      </div>
    </Shell>
  );
}
