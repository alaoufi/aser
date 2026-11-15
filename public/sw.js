/*
 * عامل خدمة «أكلات جدتنا»: إشعارات الجوال، وصفحة «نعيد الاتصال» عند تعذّر الشبكة.
 * لا تُخزَّن صفحات الموقع (تظهر التعديلات فورًا)؛ المخزَّن صفحة الانقطاع وحدها.
 */
const OFFLINE_CACHE = "jdatna-offline-v1";
const OFFLINE_URL = "/offline.html";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) => k.startsWith("jdatna-offline-") && k !== OFFLINE_CACHE,
            )
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
// فتح صفحة: من الشبكة دائمًا؛ وإن انقطع الاتصال تظهر صفحة «نعيد الاتصال» بدل صفحة خطأ المتصفح.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches
        .match(OFFLINE_URL)
        .then(
          (page) =>
            page ||
            new Response(
              "<!doctype html><meta charset=utf-8><title>أكلات جدتنا</title><p dir=rtl>تعذّر الاتصال. أعد المحاولة بعد قليل.</p>",
              { headers: { "Content-Type": "text/html; charset=utf-8" } },
            ),
        ),
    ),
  );
});

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
