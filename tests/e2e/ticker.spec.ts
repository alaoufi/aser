import { test, expect } from "@playwright/test";

test("intro ticker moves, pauses and respects reduced motion without overflow", async ({
  page,
}) => {
  await page.goto("/");
  const ticker = page.getByRole("complementary", {
    name: "نبذة عن أكلات الأجداد",
  });
  const track = ticker.locator(".about-ticker-track");
  await expect(ticker).toBeVisible();
  await expect(track).toHaveCSS("animation-name", "about-ticker-scroll");
  await ticker.getByRole("button", { name: "إيقاف حركة الشريط" }).click();
  await expect(track).toHaveCSS("animation-play-state", "paused");
  await ticker.getByRole("button", { name: "تشغيل حركة الشريط" }).click();
  await page.locator("main").hover();
  await page
    .getByRole("button", { name: "إيقاف حركة الشريط" })
    .evaluate((el) => (el as HTMLElement).blur());
  await expect(track).toHaveCSS("animation-play-state", "running");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(track).toHaveCSS("animation-name", "none");
  await expect(ticker.getByRole("button")).toHaveCount(0);
  await expect(ticker.locator(".about-ticker-copy").first()).toHaveCSS(
    "white-space",
    "normal",
  );
});
