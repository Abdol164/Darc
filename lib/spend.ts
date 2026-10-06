/**
 * One spend attempt, exactly as an agent makes it: sign an EIP-712 SpendAuth with the card's
 * agent key, then hand it to the relayer, which submits it and pays the gas.
 *
 * The agent never transacts and never holds funds. Atlas uses this in the browser; the MCP
 * server (mcp/server.ts) does the same steps from a terminal.
 */
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { ADDRESSES, SPEND_AUTH_TYPES } from "./contracts";
import { merchantProof } from "./merkle";
import { chain } from "./chain";

export type SpendAuth = {
  cardId: Hex;
  merchant: Address;
  token: Address;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
  policyVersion: bigint;
};

export type SignedSpend = { auth: SpendAuth; signature: Hex; proof: Hex[] };

export type RelayResult = {
  ok: boolean;
  /**
   * The refusal's custom error name (e.g. DailyCapExceeded), null when approved, or, for a
   * held payment, why it needs the owner (a refusal name or "Off-purpose: …").
   */
  reason: string | null;
  /** True when the payment was held on-chain for the owner's approval instead of refused. */
  pending?: boolean;
  /** The held payment's id (its EIP-712 digest), to approve or decline it. */
  requestId?: Hex;
  hash: Hex;
  blockNumber: string;
  /** Submit to receipt, measured by the relayer. */
  settleMs: number;
};

/** Authorisations stay valid for ten minutes: long enough for an owner to approve a held one from their phone. */
const AUTH_LIFETIME_S = 600;

export async function signSpend(opts: {
  cardId: Hex;
  agentPrivateKey: Hex;
  /** The card's allow-list, needed to prove `merchant` is on it. Empty means any merchant. */
  merchants: readonly Address[];
  merchant: Address;
  amountUsd: number;
  policyVersion: number;
}): Promise<SignedSpend> {
  const auth: SpendAuth = {
    cardId: opts.cardId,
    merchant: opts.merchant,
    token: ADDRESSES.paymentToken,
    amount: BigInt(Math.round(opts.amountUsd * 1e6)),
    nonce: BigInt(Date.now()),
    deadline: BigInt(Math.floor(Date.now() / 1000) + AUTH_LIFETIME_S),
    policyVersion: BigInt(opts.policyVersion),
  };
  const signature = await privateKeyToAccount(opts.agentPrivateKey).signTypedData({
    domain: { name: "AgentCard", version: "1", chainId: chain.id, verifyingContract: ADDRESSES.spendGate },
    types: SPEND_AUTH_TYPES,
    primaryType: "SpendAuth",
    message: auth,
  });
  return { auth, signature, proof: merchantProof(opts.merchants, opts.merchant) };
}

/**
 * Posts a signed authorisation to the relayer. `base` is empty in the browser. `memo` says what
 * the payment is for (checked against the card's purpose); `escalate: false` asks for a plain
 * refusal instead of holding an out-of-policy payment for the owner.
 */
export async function relay(
  signed: SignedSpend,
  base = "",
  opts: { memo?: string; escalate?: boolean } = {},
): Promise<RelayResult> {
  const { auth, signature, proof } = signed;
  const res = await fetch(`${base}/api/relay`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      auth: {
        ...auth,
        amount: auth.amount.toString(),
        nonce: auth.nonce.toString(),
        deadline: auth.deadline.toString(),
        policyVersion: auth.policyVersion.toString(),
      },
      signature,
      proof,
      memo: opts.memo,
      escalate: opts.escalate,
    }),
  });
  const data = (await res.json()) as Partial<RelayResult> & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? "the relayer could not submit that");
  return {
    ok: Boolean(data.ok),
    reason: data.reason ?? null,
    pending: data.pending,
    requestId: data.requestId,
    hash: data.hash as Hex,
    blockNumber: data.blockNumber ?? "",
    settleMs: data.settleMs ?? 0,
  };
}

/** "0.42 s" — how a settle time reads in the run log and on Activity. */
export const fmtSettle = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
