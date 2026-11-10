import { test, expect } from "@playwright/test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ProducerCard } from "../../src/components/public/ui";
import type { Producer } from "../../src/lib/types";
test("family cards keep long Arabic names, description and delivery badges readable", async ({
  page,
}, info) => {
  const producer = {
    name: "أسرة اختبار لتنسيق البطاقات والأكلات التراثية المنزلية",
    slug: "visual-test-only",
    regionName: "منطقة الرياض",
    cityName: "الرياض",
    description:
      "وصف محلي لاختبار عرض النصوص الطويلة في بطاقة الأسرة المنتجة والتأكد من وضوحها دون تداخل مع حالة التوصيل أو اسم الأسرة المنتجة.",
    verified: true,
    delivery: true,
    logoUrl: null,
  } as Producer;
  const html = renderToStaticMarkup(createElement(ProducerCard, { producer }));
  await page.goto("/producers");
  // ننتظر اكتمال التحميل حتى لا تستبدل React البطاقات المحقونة أثناء الترطيب.
  await page.waitForLoadState("networkidle");
  await page
    .locator(".empty-state, .producer-grid")
    .first()
    .evaluate((element, html) => {
      const grid = document.createElement("div");
      grid.className = "producer-grid";
      grid.setAttribute("data-testid", "test-only-card-grid");
      grid.innerHTML = html + html.replace("تمت مراجعتها", "بيانات اختبار");
      element.replaceWith(grid);
    }, html);
  await page.evaluate(() => document.fonts.ready);
  const card = page.locator(".producer-card").first();
  await expect(card.getByRole("heading")).toBeVisible();
  await expect(card.getByText("توصيل متاح")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const overflow = await card.evaluate((el) =>
    Array.from(
      el.querySelectorAll(".producer-card-content,.producer-tags,h3"),
    ).some((x) => x.scrollWidth > x.clientWidth + 1),
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: `artifacts/refined-cards-${info.project.name}.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
