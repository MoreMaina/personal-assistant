/* External Android/browser push notifications only. */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() || "You have an update." };
  }

  const title = typeof payload.title === "string"
    ? payload.title
    : "Personal Assistant";

  const options = {
    body: typeof payload.body === "string" ? payload.body : "You have an update.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: typeof payload.tag === "string" ? payload.tag : "personal-assistant",
    renotify: false,
    data: { url: typeof payload.url === "string" ? payload.url : "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  );

  if (target.origin !== self.location.origin) return;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(target.href);
        return;
      }
    }

    await self.clients.openWindow(target.href);
  })());
});
