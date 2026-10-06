import { isAddress, type Address, type Hex } from "viem";
import { MERCHANTS } from "@/config/merchants";
import { ADDRESSES, cardManagerAbi, describeReason, merchantAbi, spendRouterAbi } from "@/lib/contracts";
import { checkIntent } from "@/lib/intent";
import { notifyOwner } from "@/lib/push";
import { preview, sendAndRead, serverClient } from "@/lib/relay";
import { errorMessage } from "@/lib/server";

type Body = {
  auth?: {
    cardId: Hex;
    merchant: Address;
    token: Address;
    amount: string;
    nonce: string;
    deadline: string;
    policyVersion: string | number;
  };
  signature?: Hex;
  /** Merkle proof that the merchant is in the card's allow-list. Empty for a single-merchant card. */
  proof?: Hex[];
  /** What the agent says the payment is for, checked against the card's stated purpose. */
  memo?: string;
  /** Hold out-of-policy payments for the owner instead of refusing them. On by default. */
  escalate?: boolean;
};

/** Refusals an owner can override for one payment. Everything else is final. */
const ESCALATABLE = new Set(["DailyCapExceeded", "MerchantNotAllowed"]);

/** Preview, then submit or hold: a few seconds on Monad, never a hung function. */
export const maxDuration = 30;

/**
 * The relayer: takes an agent-signed authorisation and decides how it reaches the chain.
 *
 * It previews the payment first. One the card allows is checked against the card's stated
 * purpose and then submitted. One the card would refuse for its limit or merchant list, or
 * one that does not fit the purpose, is held on-chain for the owner to approve, and their
 * devices are notified. Any other refusal is submitted as-is, so it is recorded.
 *
 * The agent never transacts and holds no balance: it only signs. A DECLINE still costs the
 * relayer gas; that is the price of putting refusals on-chain.
 */
export async function POST(request: Request) {
  try {
    const { auth, signature, proof = [], memo, escalate = true } = (await request.json()) as Body;
    if (!auth || !signature) return Response.json({ error: "auth and signature are required" }, { status: 400 });
    if (!isAddress(auth.merchant)) return Response.json({ error: "invalid merchant" }, { status: 400 });

    // Only the demo merchants are accepted: this endpoint is unauthenticated, so it must not
    // become a way to route the owner's funds to an arbitrary address.
    const merchant = MERCHANTS.find((m) => m.address.toLowerCase() === auth.merchant.toLowerCase());
    if (!merchant) return Response.json({ error: "merchant not part of the demo" }, { status: 400 });

    const typed = {
      cardId: auth.cardId,
      merchant: auth.merchant,
      token: auth.token,
      amount: BigInt(auth.amount),
      nonce: BigInt(auth.nonce),
      deadline: BigInt(auth.deadline),
      policyVersion: BigInt(auth.policyVersion),
    };
    const charge = { address: auth.merchant, abi: merchantAbi, functionName: "charge", args: [typed, signature, proof] } as const;

    // 1. What would the card say right now?
    const [wouldPay, selector] = await preview<[boolean, Hex]>(charge);
    const gateReason = wouldPay ? null : describeReason(selector);

    // 2. A payment the card allows still has to fit what the card is for.
    let holdReason = escalate && gateReason && ESCALATABLE.has(gateReason) ? gateReason : null;
    if (escalate && wouldPay) {
      const purpose = await serverClient.readContract({
        address: ADDRESSES.cardManager,
        abi: cardManagerAbi,
        functionName: "purposeOf",
        args: [auth.cardId],
      });
      const verdict = await checkIntent({
        purpose,
        merchantName: merchant.name,
        merchantSells: merchant.sells,
        amountUsd: Number(typed.amount) / 1e6,
        memo,
      });
      if (verdict && !verdict.fits) holdReason = `Off-purpose: ${verdict.reason}`;
    }

    // 3a. Hold it for the owner.
    if (holdReason) {
      const sent = await sendAndRead<[Hex, Hex]>({
        address: ADDRESSES.spendRouter,
        abi: spendRouterAbi,
        functionName: "requestApproval",
        args: [typed, signature, proof, holdReason],
      });
      const [requestId, frozenBy] = sent.result;
      // The request itself can trip the velocity rule, in which case nothing is held.
      if (frozenBy !== "0x00000000") {
        return Response.json({ ok: false, reason: describeReason(frozenBy), ...timing(sent) });
      }

      const card = await serverClient.readContract({
        address: ADDRESSES.cardManager,
        abi: cardManagerAbi,
        functionName: "getCard",
        args: [auth.cardId],
      });
      await notifyOwner(card.owner, {
        title: `Approve $${Number(typed.amount) / 1e6} to ${merchant.name}?`,
        body: `${describeHold(holdReason)} Tap to review.`,
        url: "/approvals",
        tag: requestId,
      }).catch((err) => console.error("[api/relay] notify", err));

      return Response.json({ ok: false, pending: true, requestId, reason: holdReason, ...timing(sent) });
    }

    // 3b. Submit it, approved or refused; either way it lands in the record.
    const sent = await sendAndRead<[boolean, Hex]>(charge);
    const [ok, reasonSelector] = sent.result;
    return Response.json({ ok, reason: ok ? null : describeReason(reasonSelector), ...timing(sent) });
  } catch (err) {
    console.error("[api/relay]", err);
    return Response.json({ error: errorMessage(err) }, { status: 500 });
  }
}

const timing = (sent: { hash: Hex; blockNumber: string; settleMs: number }) => ({
  hash: sent.hash,
  blockNumber: sent.blockNumber,
  settleMs: sent.settleMs,
});

/** The notification's second line: why this payment needs the owner. */
function describeHold(reason: string): string {
  if (reason === "DailyCapExceeded") return "It is over the card's daily limit.";
  if (reason === "MerchantNotAllowed") return "That merchant is not on the card's list.";
  return reason.replace(/^Off-purpose: /, "It may not fit the card's purpose: ");
}
