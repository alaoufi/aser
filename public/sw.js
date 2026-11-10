/* عامل خدمة «أكلات جدتنا»: إشعارات الجوال فقط، بلا تخزين للصفحات حتى تظهر التعديلات فورًا. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "أكلات جدتنا", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "أكلات جدتنا";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/brand/app-icon-192.png",
      badge: "/brand/jdatna-icon.png",
      dir: "rtl",
      lang: "ar",
      tag: data.tag,
      renotify: Boolean(data.tag),
      vibrate: [200, 100, 200],
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(
    (event.notification.data && event.notification.data.url) || "/",
    self.location.origin,
  ).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        for (const w of windows) {
          if (new URL(w.url).origin === self.location.origin && "focus" in w) {
            w.navigate(url);
            return w.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
