/*
 * عامل خدمة «أكلات جدتنا»: إشعارات الجوال، وصفحة «نعيد الاتصال» عند تعذّر الشبكة.
 * لا تُخزَّن صفحات الموقع (تظهر التعديلات فورًا)؛ المخزَّن صفحة الانقطاع وحدها.
 */
const OFFLINE_CACHE = "jdatna-offline-v4";
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
// فتح صفحة: من الشبكة دائمًا. إن انقطع الاتصال، أو كان الموقع يُعاد تشغيله لتحديث (502/503/504)،
// تظهر صفحة «نعيد الاتصال» من جدتنا بالسبب بدل صفحة خطأ المتصفح أو البوابة.
const offlinePage = () =>
  caches
    .match(OFFLINE_URL)
    .then(
      (page) =>
        page ||
        new Response(
          "<!doctype html><meta charset=utf-8><title>أكلات جدتنا</title><p dir=rtl>تعذّر الاتصال. أعد المحاولة بعد قليل.</p>",
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        ),
    );
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request)
      .then((response) =>
        [502, 503, 504].includes(response.status) ? offlinePage() : response,
      )
      .catch(offlinePage),
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
  // قرار المالك 2026-11-27: تنبيه صوتي مع كل إشعار. الصوت صريح (silent: false)، والصفحات المفتوحة
  // تُبلَّغ لتُصدر نغمتها، لأن الجهاز قد لا يُصدر صوتًا والموقع أمام صاحبه.
  const tellPages = self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((windows) => {
      for (const w of windows) w.postMessage({ type: "jdatna:push", title });
    })
    .catch(() => {});
  event.waitUntil(
    Promise.all([
      tellPages,
      self.registration.showNotification(title, {
        body: data.body || "",
        icon: "/brand/app-icon-192.png",
        badge: "/brand/jdatna-icon.png",
        dir: "rtl",
        lang: "ar",
        tag: data.tag,
        renotify: Boolean(data.tag),
        silent: false,
        vibrate: [200, 100, 200],
        data: { url: data.url || "/" },
      }),
    ]),
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
