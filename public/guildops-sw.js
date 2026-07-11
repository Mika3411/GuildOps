self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "GuildOps";
  const options = {
    body: payload.body || "Nouvelle notification",
    data: {
      url: payload.url || "/app",
      notificationId: payload.notificationId || "",
      type: payload.type || "notification",
    },
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: payload.notificationId || payload.type || "guildops-notification",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/app", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existingClient = clients.find((client) => client.url.startsWith(self.location.origin));

      if (existingClient) {
        existingClient.focus();
        existingClient.navigate(targetUrl);
        return;
      }

      return self.clients.openWindow(targetUrl);
    }),
  );
});
