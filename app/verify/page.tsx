"use client";

/**
 * Verify — public, no sign-in. The page that proves the record is third-party queryable.
 *
 * Reads only through `eth_call` against the canonical ERC-8004 registry and our deployed
 * contracts: no indexer, no archive node, no API key. Deliberately shows both our aggregate
 * and the raw registry rows, so a disagreement between them would be visible.
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatUnits, getAddress, isAddress } from "viem";
import { Shell } from "@/components/shell";
import { Button, DataRow, Empty, Notice, Panel, StatusBadge, Table, ui as u } from "@/components/ui";
import { AddressLink, MerchantCell, Snippet, Stat, pieces as p } from "@/components/pieces";
import { ERC8004 } from "@/config/chain";
import { loadAgentRecord, type AgentRecord } from "@/lib/report";

function VerifyInner() {
  const search = useSearchParams();
  const [input, setInput] = useState("");
  const [result, setResult] = useState<AgentRecord>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  const lookup = useCallback(async (raw: string) => {
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    try {
      const trimmed = raw.trim();
      if (!isAddress(trimmed)) throw new Error("That does not look like an address. Paste a 0x… agent address.");
      setResult(await loadAgentRecord(getAddress(trimmed)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const preset = search.get("agent");
    if (preset) {
      setInput(preset);
      void lookup(preset);
    }
  }, [search, lookup]);

  const seenApproved = result?.attestations.filter((a) => a.verdict === "approved").length ?? 0;
  const seenDeclined = result?.attestations.filter((a) => a.verdict === "declined").length ?? 0;
  const consistent = result ? result.approved === seenApproved && result.declined === seenDeclined : true;

  const verdict = !result
    ? null
    : !result.found
      ? { kind: "expired" as const, text: "No card found for this address" }
      : result.revoked
        ? { kind: "revoked" as const, text: "Revoked — do not transact with this agent" }
        : result.expired
          ? { kind: "expired" as const, text: "Expired — this card is past its validity date" }
          : result.frozen
            ? { kind: "frozen" as const, text: "Frozen — a burst of attempts stopped this card until its owner says otherwise" }
            : { kind: "active" as const, text: "Active — this agent holds a live, unrevoked card" };

  return (
    <Shell
      title="Verify an agent"
      subtitle="Anyone can check an agent's spending record straight from Monad Testnet. No account, no API key, and no need to trust us."
    >
      <div className={p.stack}>
        <Panel>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void lookup(input);
            }}
            className={p.formRowWide}
          >
            <input
              className={p.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="0x… agent address"
              spellCheck={false}
              aria-label="Agent address"
            />
            <Button variant="primary" type="submit" disabled={busy}>
              {busy ? "Checking…" : "Verify"}
            </Button>
          </form>
        </Panel>

        {error && (
          <Notice tone="error" title="We could not look that up">
            {error}
          </Notice>
        )}

        {verdict && (
          <Panel>
            <div className={p.rowBetween}>
              <div className={u.flexCenter}>
                <StatusBadge kind={verdict.kind} />
                <strong className={u.big}>{verdict.text}</strong>
              </div>
            </div>
            {result?.found && (
              <div className={`${p.stats} ${u.mt4}`}>
                <Stat label="Approved" value={result.approved} note="payments that went through" />
                <Stat label="Refused" value={result.declined} note="blocked by policy" />
                <Stat label="Attestations" value={result.attestations.length} note="on the shared registry" />
                <Stat
                  label="Raters"
                  value={new Set(result.attestations.map((a) => a.client)).size}
                  note="merchants who reported"
                />
              </div>
            )}
          </Panel>
        )}

        {result?.found && (
          <>
            <div className={p.grid2}>
              <Panel title="Card policy">
                <DataRow label="Owner" value={result.owner ? <AddressLink address={result.owner} /> : "—"} />
                <DataRow label="For" value={result.purpose || "Not stated"} />
                <DataRow label="Daily limit" value={result.dailyCap !== undefined ? `$${formatUnits(result.dailyCap, 6)}` : "—"} />
                <DataRow
                  label="Remaining today"
                  value={result.revoked ? "—" : result.remaining !== undefined ? `$${formatUnits(result.remaining, 6)}` : "—"}
                />
                <DataRow label="Issued" value={result.issuedAt ? new Date(result.issuedAt * 1000).toLocaleDateString() : "—"} />
                <DataRow label="Expires" value={result.validUntil ? new Date(result.validUntil * 1000).toLocaleDateString() : "—"} />
              </Panel>

              <Panel title="ERC-8004 identity" note="The same registry address on every chain.">
                <DataRow label="Agent id" value={`#${result.agentId}`} />
                <DataRow label="Identity held by" value={result.holder ? <AddressLink address={result.holder} /> : "—"} />
                <DataRow label="agentWallet" value={result.wallet ? <AddressLink address={result.wallet} /> : "—"} />
                <DataRow label="Registry" value={<AddressLink address={ERC8004.identityRegistry} />} />
              </Panel>
            </div>

            <Panel
              title="Attestations, written by merchants"
              note="The registry rejects feedback from whoever holds the agent's identity, and that is Darc's own contract — so we cannot write these rows."
              flush
            >
              {result.attestations.length === 0 ? (
                <Empty title="No attestations yet" />
              ) : (
                <Table head={["Merchant", "Result", "Reason", "Score"]}>
                  {result.attestations.map((a) => (
                    <tr key={`${a.client}-${a.index}`} className={a.verdict === "approved" ? u.railOk : u.railNo}>
                      <td>
                        <MerchantCell address={a.client} />
                      </td>
                      <td>{a.verdict === "approved" ? <StatusBadge kind="approved" /> : <StatusBadge kind="declined" label="Refused" />}</td>
                      <td className={a.verdict === "approved" ? u.dim : u.danger}>
                        {a.reason === "approved" ? "—" : a.reason}
                      </td>
                      <td className={u.cellMonoMuted}>{a.value}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Panel>

            <Panel title="Cross-check" note="Our summary against the raw registry rows. They should agree, and you can see whether they do.">
              <DataRow label="Darc reports" value={`${result.approved} approved, ${result.declined} refused`} />
              <DataRow label="Registry rows say" value={`${seenApproved} approved, ${seenDeclined} refused`} />
              <DataRow
                label="Agreement"
                value={
                  <span className={`${consistent ? u.ok : u.danger} ${u.strong}`}>
                    {consistent ? "Consistent" : "Mismatch — worth investigating"}
                  </span>
                }
              />
            </Panel>
          </>
        )}

        {result && (
          <Panel
            title="For merchants"
            note="Check an agent before you accept its payment. The badge and the JSON read the same chain data as this page."
          >
            <div className={p.merchantKit}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a live SVG from our own API */}
              <img src={`/api/badge/${result.agentKey}`} alt="Darc record badge for this agent" className={p.badge} />
              <Snippet label="Embed the badge" text={`<img src="${origin}/api/badge/${result.agentKey}" alt="Darc record">`} />
              <Snippet label="Read the record as JSON" text={`curl ${origin}/api/agents/${result.agentKey}`} />
            </div>
          </Panel>
        )}

        {result && !result.found && (
          <Panel>
            <Empty title="Nothing on record">
              This address has never been issued an agent card. That is not a red flag on its own — it
              simply means there is no history to check.
            </Empty>
          </Panel>
        )}
      </div>
    </Shell>
  );
}

/**
 * `useSearchParams` bails out of prerendering, so the reader lives behind a Suspense
 * boundary and the shell still renders in the initial HTML.
 */
export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <Shell title="Verify an agent" subtitle="Anyone can check an agent's spending record straight from Monad Testnet.">
          <Panel>
            <Empty title="Loading…" />
          </Panel>
        </Shell>
      }
    >
      <VerifyInner />
    </Suspense>
  );
}
