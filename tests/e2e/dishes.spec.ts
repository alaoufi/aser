import { test, expect } from "@playwright/test";

const slug = (name: string) => "/akalat/" + encodeURIComponent(name);

// دليل الأكلات الشعبية (5.34.0.0): صفحة حقيقية لكل أكلة يبحث عنها الناس، بعنوانها ووصفها ورابطها المعتمد.
test("a dish page explains the dish and is ready for search engines", async ({
  page,
}) => {
  const res = await page.goto(slug("جريش"));
  expect(res?.status()).toBe(200);
  await expect(page).toHaveTitle(/جريش — أكلة شعبية من بيوت الأسر المنتجة/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("جريش");
  await expect(
    page.getByRole("heading", { level: 2, name: "ما هو جريش؟" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "جريش من الأسر المنتجة" }),
  ).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://jdatna.com" + slug("جريش"),
  );
  expect(
    await page.locator('meta[name="description"]').getAttribute("content"),
  ).toMatch(/قمح مجروش/);
  expect(
    await page.locator('meta[name="robots"]').getAttribute("content"),
  ).toBe("index, follow");
  const crumbs = (
    await page.locator('script[type="application/ld+json"]').allTextContents()
  )
    .map((t) => JSON.parse(t))
    .find((d) => d["@type"] === "BreadcrumbList");
  expect(crumbs.itemListElement.map((x: { name: string }) => x.name)).toEqual([
    "الرئيسية",
    "الأكلات الشعبية",
    "جريش",
  ]);
  // روابط لباقي الأكلات، ولا تمرير أفقي على الجوال.
  await expect(
    page
      .getByRole("navigation", { name: "أكلات شعبية أخرى" })
      .getByRole("link", { name: "مرقوق" }),
  ).toHaveAttribute("href", slug("مرقوق"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("the dishes hub lists every dish and an unknown dish is not found", async ({
  page,
  request,
}) => {
  await page.goto("/akalat");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "الأكلات الشعبية السعودية",
  );
  for (const name of ["جريش", "قرصان", "مرقوق", "كبسة", "كليجا"])
    await expect(
      page.locator(`.dish-list a[href="${slug(name)}"] strong`),
    ).toHaveText(name);
  await expect(page.locator(".dish-list li")).toHaveCount(12);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://jdatna.com/akalat",
  );
  expect((await request.get(slug("بيتزا"))).status()).toBe(404);
});

test("the sitemap lists the dishes hub and every dish page", async ({
  request,
}) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).toContain("<loc>https://jdatna.com/akalat</loc>");
  for (const name of ["جريش", "مرقوق", "قرصان", "كليجا"])
    expect(xml).toContain(
      `<loc>https://jdatna.com/akalat/${encodeURIComponent(name)}</loc>`,
    );
});
