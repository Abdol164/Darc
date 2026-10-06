/**
 * An agent's public record, read straight from Monad: its card policy, its ERC-8004 identity
 * and every verdict merchants have written about it.
 *
 * Shared by the /verify page and the public API (/api/agents, /api/badge), so what a person
 * sees and what a merchant's server reads can never disagree. Reads only through `eth_call`:
 * no indexer, no archive node, no key.
 */
import type { Address, Hex } from "viem";
import { ADDRESSES, cardManagerAbi, spendGateAbi } from "./contracts";
import { loadAgentReport, loadAttestations, loadIdentity, publicClient, type Attestation } from "./chain";

export type AgentRecord = {
  agentKey: Address;
  found: boolean;
  agentId?: string;
  owner?: Address;
  approved: number;
  declined: number;
  revoked: boolean;
  expired: boolean;
  dailyCap?: bigint;
  remaining?: bigint;
  validUntil?: number;
  issuedAt?: number;
  holder?: string;
  wallet?: string;
  attestations: Attestation[];
};

export type Standing = "active" | "revoked" | "expired" | "unknown";

export const standingOf = (r: AgentRecord): Standing =>
  !r.found ? "unknown" : r.revoked ? "revoked" : r.expired ? "expired" : "active";

export async function loadAgentRecord(agentKey: Address): Promise<AgentRecord> {
  const report = await loadAgentReport(agentKey);
  if (!report.found) {
    return { agentKey, found: false, approved: 0, declined: 0, revoked: false, expired: false, attestations: [] };
  }

  const [card, remaining, identity, attestations] = await Promise.all([
    publicClient.readContract({
      address: ADDRESSES.cardManager,
      abi: cardManagerAbi,
      functionName: "getCard",
      args: [report.cardId as Hex],
    }),
    publicClient.readContract({
      address: ADDRESSES.spendGate,
      abi: spendGateAbi,
      functionName: "remainingToday",
      args: [report.cardId as Hex],
    }),
    loadIdentity(report.agentId),
    loadAttestations(report.agentId),
  ]);

  return {
    agentKey,
    found: true,
    agentId: report.agentId.toString(),
    owner: report.owner,
    approved: Number(report.approvedCount),
    declined: Number(report.declinedCount),
    revoked: report.revoked,
    expired: report.expired,
    dailyCap: card.dailyCap,
    remaining,
    validUntil: Number(card.validUntil),
    issuedAt: Number(report.activeSince),
    holder: identity.holder as string | undefined,
    wallet: identity.wallet as string | undefined,
    attestations,
  };
}
