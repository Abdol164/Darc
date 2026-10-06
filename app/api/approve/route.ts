import { isHex, type Hex } from "viem";
import { MERCHANTS } from "@/config/merchants";
import { ADDRESSES, describeReason, merchantAbi, spendRouterAbi } from "@/lib/contracts";
import { sendAndRead, serverClient } from "@/lib/relay";
import { errorMessage } from "@/lib/server";

/** Settle and attest: a few seconds on Monad. */
export const maxDuration = 30;

/**
 * Settles a held payment with the owner's approval.
 *
 * The owner signs an EIP-712 OwnerApproval over the payment in their browser (one passkey
 * prompt, no gas); the relayer submits it through the merchant being paid, which records the
 * outcome as "OwnerApproved". The gate checks the signature against the card's owner, so this
 * route needs no authentication of its own: a signature from anyone else is refused on-chain.
 */
export async function POST(request: Request) {
  try {
    const { requestId, ownerSig } = (await request.json()) as { requestId?: Hex; ownerSig?: Hex };
    if (!requestId || !isHex(requestId) || !ownerSig || !isHex(ownerSig)) {
      return Response.json({ error: "requestId and ownerSig are required" }, { status: 400 });
    }

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

    const sent = await sendAndRead<[boolean, Hex]>({
      address: held.auth.merchant,
      abi: merchantAbi,
      functionName: "chargeApproved",
      args: [requestId, ownerSig],
    }).catch((err) => {
      // The router reverts on a signature that is not the owner's, rather than closing the request.
      if (/BadOwnerSignature|0x9a10af23/.test(errorMessage(err))) {
        throw new ApprovalError("That approval was not signed by this card's owner.", 403);
      }
      throw err;
    });
    const [ok, reason] = sent.result;
    return Response.json({
      ok,
      reason: ok ? null : describeReason(reason),
      hash: sent.hash,
      blockNumber: sent.blockNumber,
      settleMs: sent.settleMs,
    });
  } catch (err) {
    if (err instanceof ApprovalError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[api/approve]", err);
    return Response.json({ error: errorMessage(err) }, { status: 500 });
  }
}

class ApprovalError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
