/*
 * Darc's service worker: shows approval requests as notifications and opens the inbox when
 * one is tapped. It does nothing else: no caching, no offline mode.
 */
self.addEventListener("push", (event) => {
  const alert = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(alert.title || "Darc", {
      body: alert.body || "A payment is waiting for your approval.",
      tag: alert.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      requireInteraction: true,
      data: { url: alert.url || "/approvals" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/approvals", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
