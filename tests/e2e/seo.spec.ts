import { test, expect } from "@playwright/test";

// الأرشفة: خريطة الموقع معلنة، وصفحات الحسابات مستبعدة، وكل صفحة عامة لها عنوان ووصف وصورة مشاركة وبيانات منظمة.
test("robots announces the sitemap and hides private account pages", async ({
  request,
}) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Sitemap: https://jdtna.sa/sitemap.xml");
  for (const path of ["/dashboard", "/admin", "/messages", "/orders", "/me"])
    expect(robots).toContain(`Disallow: ${path}`);
  expect(robots).not.toContain("Disallow: /account/delete");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  const xml = await sitemap.text();
  expect(xml).toContain("<loc>https://jdtna.sa/</loc>");
  expect(xml).toContain("<loc>https://jdtna.sa/offers</loc>");
  expect(xml).toContain("<priority>");
});

test("IndexNow key file is public", async ({ request }) => {
  const res = await request.get("/0372a8f0d3b342f0b55d61b3d5f092fb.txt");
  expect(res.ok()).toBe(true);
  expect((await res.text()).trim()).toBe("0372a8f0d3b342f0b55d61b3d5f092fb");
});

test("the home page carries search keywords, share image and site schema", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/أكلات شعبية وطبخ بيت من الأسر المنتجة/);
  const meta = (sel: string) =>
    page.locator(sel).first().getAttribute("content");
  expect(await meta('meta[name="description"]')).toMatch(/أكلات شعبية/);
  expect(await meta('meta[name="keywords"]')).toMatch(/أسر منتجة/);
  expect(await meta('meta[property="og:image"]')).toMatch(
    /\/brand\/og-image\.jpg$/,
  );
  expect(await meta('meta[property="og:locale"]')).toBe("ar_SA");
  expect(await meta('meta[name="msvalidate.01"]')).toBe(
    "DD56AF86857C1DF8A258AB365A6A4C76",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://jdtna.sa",
  );
  const schemas = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  const site = schemas.map((t) => JSON.parse(t)).find((d) => d["@graph"]);
  const types = site["@graph"].map((x: { "@type": string }) => x["@type"]);
  expect(types).toEqual(["Organization", "WebSite"]);
  expect(site["@graph"][1].potentialAction["@type"]).toBe("SearchAction");
  // «يبحث الناس عن»: روابط بحث حقيقية تفتح نتائج البحث.
  const searches = page.getByRole("navigation", { name: "عمليات بحث شائعة" });
  // الكلمة التي لها صفحة في دليل الأكلات تفتح صفحتها.
  await expect(searches.getByRole("link", { name: "جريش" })).toHaveAttribute(
    "href",
    "/akalat/" + encodeURIComponent("جريش"),
  );
  await expect(
    searches.getByRole("link", { name: "كل الأكلات الشعبية" }),
  ).toHaveAttribute("href", "/akalat");
});

test("search pages get their own title, description and canonical", async ({
  page,
}) => {
  await page.goto("/browse?q=" + encodeURIComponent("لقيمات"));
  await expect(page).toHaveTitle(/لقيمات — أكل بيت من الأسر المنتجة/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://jdtna.sa/browse?q=" + encodeURIComponent("لقيمات"),
  );
  // البحث باسم أكلة لها صفحة في الدليل: الرابط المعتمد صفحتها.
  await page.goto("/browse?q=" + encodeURIComponent("جريش"));
  await expect(page).toHaveTitle(/جريش — أكل بيت من الأسر المنتجة/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://jdtna.sa/akalat/" + encodeURIComponent("جريش"),
  );
  // صورة المشاركة الافتراضية تبقى للصفحات التي بلا صورة.
  expect(
    await page
      .locator('meta[property="og:image"]')
      .first()
      .getAttribute("content"),
  ).toMatch(/og-image\.jpg$/);
});
