import { isAddress, isHex, verifyMessage, type Address, type Hex } from "viem";
import type { PushSubscription } from "web-push";
import { pushEnabled, removeSubscription, saveSubscription } from "@/lib/push";
import { subscribeMessage } from "@/lib/push-message";
import { errorMessage } from "@/lib/server";

export async function GET() {
  return Response.json({ enabled: pushEnabled(), publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null });
}

/** Sign a device up for the owner's approval alerts. */
export async function POST(request: Request) {
  try {
    if (!pushEnabled()) return Response.json({ error: "Phone notifications are not set up on this server." }, { status: 503 });
    const { owner, subscription, signature } = (await request.json()) as {
      owner?: Address;
      subscription?: PushSubscription;
      signature?: Hex;
    };
    if (!owner || !isAddress(owner) || !subscription?.endpoint || !signature || !isHex(signature)) {
      return Response.json({ error: "owner, subscription and signature are required" }, { status: 400 });
    }
    const valid = await verifyMessage({
      address: owner,
      message: subscribeMessage(owner, subscription.endpoint),
      signature,
    });
    if (!valid) return Response.json({ error: "That signature is not the owner's." }, { status: 403 });

    await saveSubscription(owner, subscription);
    return Response.json({ subscribed: true });
  } catch (err) {
    console.error("[api/push/subscribe]", err);
    return Response.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/** Stop alerts on a device. Removing a subscription needs no signature: it only stops alerts. */
export async function DELETE(request: Request) {
  try {
    const { owner, endpoint } = (await request.json()) as { owner?: Address; endpoint?: string };
    if (!owner || !isAddress(owner) || !endpoint) return Response.json({ error: "owner and endpoint are required" }, { status: 400 });
    if (pushEnabled()) await removeSubscription(owner, endpoint);
    return Response.json({ subscribed: false });
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 500 });
  }
}
