/**
 * Phone notifications for approval requests (Web Push).
 *
 * Subscriptions are stored per owner in Upstash Redis. A device subscribes only with the
 * owner's signature (see app/api/push/subscribe), so nobody can sign their own phone up to
 * another owner's alerts. Push is optional: without its keys and store configured, approval
 * requests still appear in the live inbox on every signed-in device.
 */
import { Redis } from "@upstash/redis";
import webpush, { type PushSubscription } from "web-push";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "https://usedarc.site";

/** Vercel's Upstash integration may name the variables either way. */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

export const pushEnabled = () => Boolean(VAPID_PUBLIC && VAPID_PRIVATE && REDIS_URL && REDIS_TOKEN);

let configured = false;
function setup() {
  if (configured || !pushEnabled()) return;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC!, VAPID_PRIVATE!);
  configured = true;
}

const redis = () => new Redis({ url: REDIS_URL!, token: REDIS_TOKEN! });
const keyFor = (owner: string) => `push:${owner.toLowerCase()}`;

export async function saveSubscription(owner: string, subscription: PushSubscription) {
  // A hash keyed by endpoint: re-subscribing the same device replaces its entry.
  await redis().hset(keyFor(owner), { [subscription.endpoint]: JSON.stringify(subscription) });
}

export async function removeSubscription(owner: string, endpoint: string) {
  await redis().hdel(keyFor(owner), endpoint);
}

export type Alert = { title: string; body: string; url: string; tag?: string };

/** Sends to every device the owner signed up. Expired subscriptions are dropped. */
export async function notifyOwner(owner: string, alert: Alert): Promise<number> {
  if (!pushEnabled()) return 0;
  setup();
  const all = (await redis().hgetall<Record<string, PushSubscription | string>>(keyFor(owner))) ?? {};
  let sent = 0;
  await Promise.all(
    Object.entries(all).map(async ([endpoint, raw]) => {
      const subscription = (typeof raw === "string" ? JSON.parse(raw) : raw) as PushSubscription;
      try {
        await webpush.sendNotification(subscription, JSON.stringify(alert), { TTL: 600, urgency: "high" });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: the device unsubscribed or the subscription expired.
        if (status === 404 || status === 410) await removeSubscription(owner, endpoint);
        else console.error("[push]", status, err);
      }
    }),
  );
  return sent;
}
