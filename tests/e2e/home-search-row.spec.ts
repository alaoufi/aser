import { expect, test } from "@playwright/test";

/**
 * سطر «وش تطلب اليوم» والمنطقة في الرئيسية على الجوال (9.0.3.1، طلب المالك):
 * إطار واحد (اللون والسماكة والزوايا) وارتفاع واحد، وخانة البحث بطول عبارتها والباقي للمنطقة،
 * والتركيز لا يرسم إطارًا ثانيًا خارج خانة المنطقة (كان يبقى بعد الاختيار فيبدو أطول).
 */
for (const width of [320, 360, 390, 412]) {
  test(`home search and region share one frame at ${width}px`, async ({
    browser,
  }) => {
    const page = await browser.newPage({
      viewport: { width, height: 800 },
      hasTouch: true,
      isMobile: true,
    });
    await page.goto("/");
    const read = () =>
      page.evaluate(() => {
        const box = (sel: string) => {
          const el = document.querySelector(sel)!;
          const c = getComputedStyle(el),
            r = el.getBoundingClientRect();
          return {
            w: r.width,
            h: r.height,
            top: r.top,
            color: c.borderTopColor,
            size: c.borderTopWidth,
            radius: c.borderTopLeftRadius,
            outline: c.outlineStyle,
          };
        };
        const input =
          document.querySelector<HTMLInputElement>(".hero-search input")!;
        const ctx = document.createElement("canvas").getContext("2d")!;
        ctx.font = getComputedStyle(input).font;
        return {
          search: box(".hero-copy .hero-search"),
          region: box(".hero-region select"),
          placeholder: ctx.measureText(input.placeholder).width,
          inputWidth: input.clientWidth,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
    const r = await read();
    expect(r.overflow).toBe(false);
    expect(Math.abs(r.search.h - r.region.h)).toBeLessThan(1);
    expect(Math.abs(r.search.top - r.region.top)).toBeLessThan(1);
    expect(r.region.color).toBe(r.search.color);
    expect(r.region.size).toBe(r.search.size);
    expect(r.region.radius).toBe(r.search.radius);
    // عبارة البحث كاملة، والخانة لا تزيد عليها كثيرًا.
    expect(r.inputWidth + 1).toBeGreaterThanOrEqual(r.placeholder);
    expect(r.inputWidth).toBeLessThan(r.placeholder + 12);
    if (width >= 390) expect(r.region.w).toBeGreaterThan(r.search.w);

    // بعد اختيار المنطقة يبقى الإطار نفسه بلون التركيز، بلا إطار خارجي.
    await page.locator(".hero-region select").focus();
    const f = await read();
    expect(f.region.outline).toBe("none");
    expect(f.region.color).not.toBe(r.region.color);
    expect(Math.abs(f.region.h - f.search.h)).toBeLessThan(1);
    await page.close();
  });
}
