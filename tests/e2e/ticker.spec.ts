import { test, expect } from "@playwright/test";

test("intro ticker moves, pauses and respects reduced motion without overflow", async ({
  page,
}) => {
  await page.goto("/");
  const ticker = page.getByRole("complementary", {
    name: "نبذة عن أكلات جدتنا",
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

test("ticker travels left to right with an identical seamless repeat", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.locator(".about-ticker-track").evaluate((track) => {
    const animation = track.getAnimations()[0];
    animation.pause();
    const duration = Number(animation.effect!.getComputedTiming().duration);
    const copies = track.querySelectorAll<HTMLElement>(".about-ticker-copy");
    animation.currentTime = 0;
    const first = copies[1].getBoundingClientRect().left;
    const x0 = track.getBoundingClientRect().left;
    animation.currentTime = duration / 4;
    const x1 = track.getBoundingClientRect().left;
    animation.currentTime = duration - 0.01;
    const last = copies[0].getBoundingClientRect().left;
    return {
      first,
      last,
      x0,
      x1,
      widths: [...copies].map((c) => c.getBoundingClientRect().width),
      texts: [...copies].map((c) => c.textContent),
    };
  });
  expect(result.x1).toBeGreaterThan(result.x0);
  expect(Math.abs(result.first - result.last)).toBeLessThan(1);
  expect(result.widths[0]).toBeCloseTo(result.widths[1], 2);
  expect(result.texts[0]).toBe(result.texts[1]);
  await expect(
    page.getByText("اكتشف المتاح في مدينتك", { exact: true }),
  ).toBeVisible();
});
