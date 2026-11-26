import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * «المظهر» (طلب المالك 2026-11-26): قالبان (الكلاسيكي والمبسّط) × أربعة ألوان (تراثي «السدو»، نخيل،
 * ليلي، تباين عالٍ) × الجوال والتابلت والكمبيوتر. الاختيار في cookie يقرؤه الخادم (لا وميض)،
 * ويبقى بعد إعادة التحميل. أول زيارة تتبع الوضع الداكن لجهاز الزائر إن لم يختر.
 * تعمل بلا قاعدة بيانات (الإعداد الافتراضي: كل القوالب والألوان متاحة).
 */
const TEMPLATES = ["classic", "simple"] as const;
const PALETTES = ["sadu", "nakheel", "lail", "contrast"] as const;
const SIZES = [
  [390, 844],
  [768, 1024],
  [1280, 900],
] as const;

async function choose(page: Page, template: string, palette: string) {
  await page.context().addCookies([
    { name: "jdatna_template", value: template, url: "http://127.0.0.1:3000" },
    { name: "jdatna_palette", value: palette, url: "http://127.0.0.1:3000" },
  ]);
}
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test.describe("templates × palettes × sizes", () => {
  // المصفوفة مرة واحدة (مشروع الكمبيوتر يغيّر مقاسه بنفسه)، لا تتكرر في مشروع الجوال.
  test.skip(({ isMobile }) => isMobile, "المقاسات الثلاثة داخل الاختبار");
  for (const template of TEMPLATES)
    test(`${template}: every palette at 390/768/1280, painted by the server`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      for (const palette of PALETTES) {
        await choose(page, template, palette);
        for (const [w, h] of SIZES) {
          await page.setViewportSize({ width: w, height: h });
          const res = await page.goto("/");
          // لا وميض: اللون والقالب في HTML الخادم نفسه قبل أي JavaScript.
          const html = (await res?.text()) ?? "";
          expect(html).toContain(`data-template="${template}"`);
          if (palette === "sadu")
            expect(html).not.toMatch(/<html[^>]*data-palette=/);
          else expect(html).toContain(`data-palette="${palette}"`);
          const root = page.locator("html");
          await expect(root).toHaveAttribute("data-template", template);
          if (palette === "sadu")
            await expect(root).not.toHaveAttribute("data-palette");
          else await expect(root).toHaveAttribute("data-palette", palette);
          if (template === "simple") {
            await expect(
              page.getByRole("heading", {
                level: 1,
                name: "أكل بيت جدتك، من أسرة في حيّك",
              }),
            ).toBeVisible();
            await expect(
              page.getByRole("button", { name: "ابحث عن أكلة في مدينتي" }),
            ).toBeVisible();
            await expect(
              page.getByText("كل أسرة تُراجَع مستنداتها قبل الظهور."),
            ).toBeVisible();
            // «أحب أكلات» في سطر واحد، ولا تتداخل التسمية مع حقلها (تعديل المالك 2026-11-26).
            await expect(
              page.getByRole("searchbox", { name: "أحب أكلات" }),
            ).toBeVisible();
            const fit = await page.evaluate(() =>
              [...document.querySelectorAll(".simple-search-row")].map(
                (row) => {
                  const label = row.querySelector(".simple-search-label")!;
                  const field = row.querySelector("input, select")!;
                  const l = label.getBoundingClientRect();
                  const f = field.getBoundingClientRect();
                  const line =
                    parseFloat(getComputedStyle(label).lineHeight) || 24;
                  return {
                    oneLine: l.height <= line * 1.2,
                    apart: l.right <= f.left + 1 || f.right <= l.left + 1,
                  };
                },
              ),
            );
            for (const r of fit)
              expect(r, `${template}/${palette}/${w}`).toEqual({
                oneLine: true,
                apart: true,
              });
            // بلا الطاولة الخشبية وبلا الشارة العائمة.
            await expect(page.locator(".today-table")).toHaveCount(0);
            await expect(
              page.locator(
                "body > .verified-seal, :not(.footer-verified) > .verified-seal",
              ),
            ).toHaveCount(0);
          } else {
            await expect(page.locator(".simple-hero")).toHaveCount(0);
          }
          expect(await noOverflow(page), `${template}/${palette}/${w}`).toBe(
            true,
          );
        }
      }
    });
});

test("the visitor picks template and colour from «المظهر» with instant preview, kept after reload", async ({
  page,
}) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-template", "classic");
  await expect(html).not.toHaveAttribute("data-palette");
  const open = async () => {
    await page
      .locator(".site-header")
      .getByRole("button", { name: "المظهر" })
      .click();
    return page.getByRole("dialog", { name: "المظهر" });
  };
  let panel = await open();
  // اللون فوري بلا إعادة تحميل.
  await panel.getByRole("button", { name: "ليلي" }).click();
  await expect(html).toHaveAttribute("data-palette", "lail");
  const bg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  expect(bg).not.toBe("rgb(252, 248, 240)");
  await panel.getByRole("button", { name: "المبسّط" }).click();
  await expect(html).toHaveAttribute("data-template", "simple");
  await expect(page.locator(".simple-title")).toBeVisible();
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "jdatna_palette")?.value).toBe("lail");
  expect(cookies.find((c) => c.name === "jdatna_template")?.value).toBe(
    "simple",
  );
  await page.reload();
  await expect(html).toHaveAttribute("data-template", "simple");
  await expect(html).toHaveAttribute("data-palette", "lail");
  await page.goto("/about");
  await expect(html).toHaveAttribute("data-palette", "lail");
  // زر «المظهر» في التذييل أيضًا، والعودة للأصل.
  await page
    .locator(".site-footer")
    .getByRole("button", { name: "المظهر" })
    .click();
  panel = page.locator(".site-footer").getByRole("dialog", { name: "المظهر" });
  await panel.getByRole("button", { name: "السدو" }).click();
  await expect(html).not.toHaveAttribute("data-palette");
  await panel.getByRole("button", { name: "الكلاسيكي" }).click();
  await expect(html).toHaveAttribute("data-template", "classic");
  expect(await noOverflow(page)).toBe(true);
});

test.describe("first visit follows the device until the visitor chooses", () => {
  test.use({ colorScheme: "dark" });
  test("dark device → ليلي; an explicit choice wins after reload", async ({
    page,
  }) => {
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-palette", "lail");
    await page
      .locator(".site-header")
      .getByRole("button", { name: "المظهر" })
      .click();
    await page
      .getByRole("dialog", { name: "المظهر" })
      .getByRole("button", { name: "السدو" })
      .click();
    await page.reload();
    await expect(html).not.toHaveAttribute("data-palette");
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("the moving ticker stops for visitors who reduce motion", async ({
    page,
  }) => {
    await page.goto("/");
    const track = page.locator(".about-ticker-track").first();
    if (await track.count())
      expect(
        await track.evaluate((e) => getComputedStyle(e).animationName),
      ).toBe("none");
  });
});

test("audit fixes: footer search links readable, store badge names include the visible text", async ({
  page,
}) => {
  await page.goto("/");
  const ratio = await page.evaluate(() => {
    const a = document.querySelector(".footer-searches a");
    const f = document.querySelector(".site-footer");
    if (!a || !f) return 99;
    const rgb = (s: string) => (s.match(/\d+/g) ?? []).slice(0, 3).map(Number);
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((x) => {
        const v = x / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [x, y] = [
      lum(rgb(getComputedStyle(a).color)),
      lum(rgb(getComputedStyle(f).backgroundColor)),
    ].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
  for (const badge of await page.locator(".store-badge").all()) {
    const label = (await badge.getAttribute("aria-label")) ?? "";
    const visible =
      (await badge.locator(".store-badge-text").textContent())
        ?.replace(/\s+/g, " ")
        .trim() ?? "";
    expect(label.startsWith(visible)).toBe(true);
  }
});

for (const template of TEMPLATES)
  for (const palette of ["sadu", "lail", "contrast"] as const)
    test(`axe: no WCAG A/AA violations on the home page (${template}, ${palette})`, async ({
      page,
    }) => {
      await choose(page, template, palette);
      await page.goto("/");
      const r = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        // ألوان بطاقات الأسر تولَّد من هوية كل أسرة (قائم قبل هذا التعديل، ويعتمد على البيانات).
        .exclude(".producer-avatar")
        .analyze();
      expect(
        r.violations.map(
          (v) =>
            `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
        ),
      ).toEqual([]);
    });
