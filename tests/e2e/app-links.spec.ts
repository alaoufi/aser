import { test, expect } from "@playwright/test";

const PLAY = "https://play.google.com/store/apps/details?id=com.jdatna.app";
const APPLE = "https://apps.apple.com/sa/app/id6833382132";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

// روابط التطبيق المختصرة: /gl لـ Google Play، و/ios لـ App Store، و/app للمتجر المناسب للجوال
// (قرار المالك 2026-11-27: على الجوال صفحة قصيرة كدعوة الصديق ثم متجره).
test("short links open the right store", async ({ playwright, baseURL }) => {
  const plain = await playwright.request.newContext({ baseURL });
  for (const [path, store] of [
    ["/gl", PLAY],
    ["/ios", APPLE],
  ]) {
    const res = await plain.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(302);
    expect(res.headers().location, path).toBe(store);
  }
  for (const [agent, store] of [
    [ANDROID, PLAY],
    [IPHONE, APPLE],
  ]) {
    const phone = await playwright.request.newContext({
      baseURL,
      userAgent: agent,
    });
    const res = await phone.get("/app", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("حمّل تطبيق أكلات جدتنا");
    // الآيفون إلى App Store دائمًا؛ وأندرويد إلى Google Play إن كان زره مفعّلًا، وإلا التسجيل.
    if (store === APPLE) expect(html).toContain(`href="${APPLE}"`);
    else
      expect(
        html.includes(`href="${PLAY}"`) ||
          html.includes('href="/login?signup=1"'),
      ).toBe(true);
    await phone.dispose();
  }
  await plain.dispose();
});

test("on a computer /app shows both stores", async ({ browser }) => {
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  });
  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "حمّل تطبيق أكلات جدتنا",
  );
  await expect(
    page.getByRole("link", { name: "الآيفون: App Store" }),
  ).toHaveAttribute("href", APPLE);
  await expect(
    page.getByRole("link", { name: "أندرويد: Google Play" }),
  ).toHaveAttribute("href", PLAY);
  await page.close();
});
