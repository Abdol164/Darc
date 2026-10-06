import { getAddress, isAddress } from "viem";
import { loadAgentRecord, standingOf } from "@/lib/report";
import { errorMessage } from "@/lib/server";

/** Open to any site: this is public chain data, and merchants call it from their own servers. */
const HEADERS = { "access-control-allow-origin": "*", "cache-control": "public, max-age=15" };

const usd = (v?: bigint) => (v === undefined ? null : Number(v) / 1e6);
const iso = (seconds?: number) => (seconds ? new Date(seconds * 1000).toISOString() : null);

/**
 * An agent's public record as JSON, for a merchant to check before accepting a payment.
 * The same reads the /verify page makes (lib/report.ts), so the two can never disagree.
 */
export async function GET(request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address)) {
    return Response.json({ error: "Not an address. Pass the agent's 0x… address." }, { status: 400, headers: HEADERS });
  }

  try {
    const record = await loadAgentRecord(getAddress(address));
    const origin = new URL(request.url).origin;
    return Response.json(
      {
        agent: record.agentKey,
        found: record.found,
        standing: standingOf(record),
        agentId: record.agentId ?? null,
        owner: record.owner ?? null,
        approved: record.approved,
        refused: record.declined,
        frozen: record.frozen,
        purpose: record.purpose ?? null,
        dailyLimitUsd: usd(record.dailyCap),
        remainingTodayUsd: record.revoked ? 0 : usd(record.remaining),
        activeSince: iso(record.issuedAt),
        validUntil: iso(record.validUntil),
        verdicts: record.attestations.map((a) => ({
          merchant: a.client,
          verdict: a.verdict,
          // A plain approval has no reason; an owner override keeps its "OwnerApproved" tag.
          reason: a.reason === "approved" ? null : a.reason,
        })),
        chainId: 10143,
        verifyUrl: `${origin}/verify?agent=${record.agentKey}`,
        badgeUrl: `${origin}/api/badge/${record.agentKey}`,
      },
      { headers: HEADERS },
    );
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 502, headers: HEADERS });
  }
}
