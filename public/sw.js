/* Tchaikovsky CRM Service Worker for Web Push notifications */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = null;
  try {
    payload = event.data.json();
  } catch {
    try {
      payload = { title: "Tchaikovsky CRM", body: event.data.text() };
    } catch {
      return;
    }
  }

  if (!payload || typeof payload !== "object") return;

  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : "Tchaikovsky CRM";
  const body =
    typeof payload.body === "string" && payload.body.trim()
      ? payload.body.trim()
      : "New incoming message";
  const tag =
    typeof payload.tag === "string" && payload.tag.trim()
      ? payload.tag.trim()
      : `crm-msg-${Date.now()}`;
  const url =
    typeof payload.url === "string" && payload.url.startsWith("/")
      ? payload.url
      : "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/logo.png",
      badge: "/logo.png",
      tag,
      renotify: true,
      silent: false,
      timestamp: typeof payload.timestamp === "number" ? payload.timestamp : Date.now(),
      data: {
        conversationId: payload.conversationId || "",
        url,
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const conversationId =
    typeof data.conversationId === "string" ? data.conversationId : "";
  const targetUrl =
    typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/";

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      if (clientsList.length > 0) {
        const preferred =
          clientsList.find((c) => c.visibilityState === "visible") || clientsList[0];
        if (preferred) {
          if (conversationId) {
            preferred.postMessage({
              type: "crm:open-chat",
              conversationId,
            });
          } else if (targetUrl !== "/" && "navigate" in preferred) {
            await preferred.navigate(targetUrl).catch(() => {});
          }
          if ("focus" in preferred) {
            await preferred.focus().catch(() => {});
          }
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
