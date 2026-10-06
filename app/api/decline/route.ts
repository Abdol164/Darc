import { isHex, type Hex } from "viem";
import { MERCHANTS } from "@/config/merchants";
import { ADDRESSES, describeReason, merchantAbi, spendRouterAbi } from "@/lib/contracts";
import { preview, sendAndRead, serverClient } from "@/lib/relay";
import { errorMessage } from "@/lib/server";

/** Submit and attest: a few seconds on Monad. */
export const maxDuration = 30;

/**
 * Declines a held payment by submitting it exactly as the agent signed it. The card's own
 * rule refuses it, the merchant records that refusal, and the request closes.
 *
 * No signature is needed: submitting an agent-signed payment can only ever produce what the
 * card's rules allow. That is also the one trap, so it is checked first. If the owner has
 * since raised the limit, submitting would PAY it, so in that case nothing is sent and the
 * request is left to expire.
 */
export async function POST(request: Request) {
  try {
    const { requestId } = (await request.json()) as { requestId?: Hex };
    if (!requestId || !isHex(requestId)) return Response.json({ error: "requestId is required" }, { status: 400 });

    const held = await serverClient.readContract({
      address: ADDRESSES.spendRouter,
      abi: spendRouterAbi,
      functionName: "getRequest",
      args: [requestId],
    });
    if (held.status !== 1) return Response.json({ error: "This request is no longer waiting." }, { status: 409 });
    if (!MERCHANTS.some((m) => m.address.toLowerCase() === held.auth.merchant.toLowerCase())) {
      return Response.json({ error: "merchant not part of the demo" }, { status: 400 });
    }

    const charge = {
      address: held.auth.merchant,
      abi: merchantAbi,
      functionName: "charge",
      args: [held.auth, held.agentSig, held.merchantProof],
    } as const;
    const [wouldPay] = await preview<[boolean, Hex]>(charge);
    if (wouldPay) {
      const expires = new Date(Number(held.auth.deadline) * 1000).toLocaleTimeString();
      return Response.json(
        { error: `This payment now fits the card's rules, so declining it here would pay it. It expires unused at ${expires}.` },
        { status: 409 },
      );
    }

    const sent = await sendAndRead<[boolean, Hex]>(charge);
    const [ok, reason] = sent.result;
    return Response.json({
      ok,
      reason: ok ? null : describeReason(reason),
      hash: sent.hash,
      blockNumber: sent.blockNumber,
      settleMs: sent.settleMs,
    });
  } catch (err) {
    console.error("[api/decline]", err);
    return Response.json({ error: errorMessage(err) }, { status: 500 });
  }
}
