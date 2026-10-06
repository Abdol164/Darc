"use client";

/**
 * Phone alerts for approval requests. Turning them on registers the service worker, asks the
 * browser for permission, and signs the device up with the owner's passkey: the server only
 * stores a subscription the owner's key signed for, so nobody else can route their alerts to a
 * device.
 */
import { useEffect, useState } from "react";
import { Button, Notice } from "./ui";
import { useOwner } from "@/lib/owner-context";
import { subscribeMessage } from "@/lib/push-message";
import a from "./approvals.module.css";

type Support = "checking" | "unsupported" | "needs-install" | "off-server" | "ready";

/** Web Push wants the key as bytes; the server hands it out base64url-encoded. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function PushToggle() {
  const { owner, runOwnerAction, busy } = useOwner();
  const [support, setSupport] = useState<Support>("checking");
  const [publicKey, setPublicKey] = useState<string>();
  const [subscribed, setSubscribed] = useState(false);
  const [problem, setProblem] = useState<string>();

  useEffect(() => {
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // iPhone and iPad only offer Web Push to sites added to the Home Screen.
        const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
        setSupport(ios ? "needs-install" : "unsupported");
        return;
      }
      const config = (await fetch("/api/push/subscribe").then((r) => r.json()).catch(() => null)) as {
        enabled: boolean;
        publicKey: string | null;
      } | null;
      if (!config?.enabled || !config.publicKey) {
        setSupport("off-server");
        return;
      }
      setPublicKey(config.publicKey);
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      setSubscribed(Boolean(await registration?.pushManager.getSubscription()));
      setSupport("ready");
    })();
  }, []);

  const turnOn = async () => {
    setProblem(undefined);
    if (!owner || !publicKey) return;
    try {
      if ((await Notification.requestPermission()) !== "granted") {
        setProblem("Notifications are blocked for this site. Allow them in your browser's settings, then try again.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));

      const done = await runOwnerAction("Signing up this device", async (wallet, address) => {
        const signature = await wallet.signMessage({
          account: wallet.account!,
          message: subscribeMessage(address, subscription.endpoint),
        });
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ owner: address, subscription: subscription.toJSON(), signature }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "The server did not accept this device.");
        return true;
      });
      if (done) setSubscribed(true);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    }
  };

  const turnOff = async () => {
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription && owner) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner, endpoint: subscription.endpoint }),
      }).catch(() => undefined);
      await subscription.unsubscribe();
    }
    setSubscribed(false);
  };

  return (
    <div className={a.push}>
      {support === "checking" && <p className={a.empty}>Checking this browser…</p>}
      {support === "unsupported" && (
        <p className={a.empty}>This browser cannot receive notifications. Keep this page open instead: requests appear here within seconds.</p>
      )}
      {support === "needs-install" && (
        <p className={a.empty}>
          On iPhone and iPad, add Darc to your Home Screen first (Share, then Add to Home Screen), open it from there, and turn
          alerts on.
        </p>
      )}
      {support === "off-server" && (
        <p className={a.empty}>Phone alerts are not set up on this server yet. Requests still appear here within seconds.</p>
      )}
      {support === "ready" && (
        <div className={a.pushRow}>
          {subscribed ? (
            <>
              <span className={a.on}>
                <span className={a.onDot} />
                Alerts on for this device
              </span>
              <Button variant="ghost" onClick={turnOff}>
                Turn off
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={turnOn} disabled={!!busy || !owner}>
              {busy ?? "Send approval requests to this device"}
            </Button>
          )}
        </div>
      )}
      {problem && (
        <Notice tone="error" title="Alerts are not on">
          {problem}
        </Notice>
      )}
    </div>
  );
}
