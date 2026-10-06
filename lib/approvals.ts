/**
 * Payments held for the owner's approval.
 *
 * A held payment lives on-chain in SpendRouter, stored whole, so any device the owner signs in
 * on can see it and approve it: the approval is an EIP-712 signature over the payment, made with
 * the passkey-derived owner key, which Darc's relayer submits. Nothing about a pending approval
 * is kept on a server.
 */
import type { Address, Hex, WalletClient } from "viem";
import { ADDRESSES, OWNER_APPROVAL_TYPES, spendRouterAbi } from "./contracts";
import { chain, publicClient } from "./chain";
import type { RelayResult } from "./spend";

export type HeldPayment = {
  id: Hex;
  cardId: Hex;
  merchant: Address;
  amountUsd: number;
  /** Why it needs the owner: a refusal name, or "Off-purpose: …" from the intent check. */
  reason: string;
  requestedAt: number;
  /** The agent's authorisation lapses at this time (ms); after it the request cannot settle. */
  expiresAt: number;
};

/** Only the most recent requests per card are read: older ones are long resolved or expired. */
const RECENT = 12;

/** Open, unexpired requests across the given cards, newest first. */
export async function loadHeldPayments(cardIds: readonly Hex[]): Promise<HeldPayment[]> {
  const perCard = await Promise.all(
    cardIds.map(async (cardId) => {
      const ids = await publicClient.readContract({
        address: ADDRESSES.spendRouter,
        abi: spendRouterAbi,
        functionName: "requestIdsOf",
        args: [cardId],
      });
      return ids.slice(-RECENT).map((id) => ({ cardId, id }));
    }),
  );
  const requests = await Promise.all(
    perCard.flat().map(async ({ cardId, id }) => {
      const r = await publicClient.readContract({
        address: ADDRESSES.spendRouter,
        abi: spendRouterAbi,
        functionName: "getRequest",
        args: [id],
      });
      return {
        id,
        cardId,
        open: r.status === 1,
        merchant: r.auth.merchant,
        amountUsd: Number(r.auth.amount) / 1e6,
        reason: r.reason,
        requestedAt: Number(r.requestedAt) * 1000,
        expiresAt: Number(r.auth.deadline) * 1000,
      };
    }),
  );
  const now = Date.now();
  return requests
    .filter((r) => r.open && r.expiresAt > now)
    .map(({ open: _open, ...held }) => held)
    .sort((a, b) => b.requestedAt - a.requestedAt);
}

/** Sign the owner's approval of one held payment, then have the relayer settle it. */
export async function approveHeldPayment(wallet: WalletClient, requestId: Hex): Promise<RelayResult> {
  const ownerSig = await wallet.signTypedData({
    account: wallet.account!,
    domain: { name: "AgentCard", version: "1", chainId: chain.id, verifyingContract: ADDRESSES.spendGate },
    types: OWNER_APPROVAL_TYPES,
    primaryType: "OwnerApproval",
    message: { authDigest: requestId },
  });
  return post("/api/approve", { requestId, ownerSig });
}

/** Decline: the payment is submitted as signed, so the card's own rule refuses it on record. */
export const declineHeldPayment = (requestId: Hex): Promise<RelayResult> => post("/api/decline", { requestId });

async function post(path: string, body: unknown): Promise<RelayResult> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json()) as Partial<RelayResult> & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? "That did not go through.");
  return {
    ok: Boolean(data.ok),
    reason: data.reason ?? null,
    hash: data.hash as Hex,
    blockNumber: data.blockNumber ?? "",
    settleMs: data.settleMs ?? 0,
  };
}

/** "Over today's limit" — how a hold reason reads to the owner. */
export function describeHoldReason(reason: string): string {
  if (reason === "DailyCapExceeded") return "Over today's limit";
  if (reason === "MerchantNotAllowed") return "Merchant not on the card's list";
  if (reason.startsWith("Off-purpose: ")) return reason.slice("Off-purpose: ".length);
  return reason;
}
