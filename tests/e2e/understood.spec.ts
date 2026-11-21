import { test, expect } from "@playwright/test";

// التفاهم: جملة طلب بكلام العميل تُفهم في صفحة البحث، ويُسأل عن أول ما ينقصها.
test("a sentence request is understood and the missing dish is asked", async ({
  page,
}) => {
  await page.goto(
    "/browse?q=" + encodeURIComponent("أبي غدا لعشرة بالرياض بميزانية 300"),
  );
  const panel = page.getByRole("region", { name: "فهمنا طلبك" });
  await expect(panel).toBeVisible();
  for (const text of ["الوجبة", "غداء", "10 أشخاص", "الرياض", "300 ريال"])
    await expect(panel).toContainText(text);
  await expect(panel).toContainText("وش الأكلة اللي تبيها؟");
  // اختيار أكلة يعيد البحث بالأكلة مع بقية الطلب.
  await panel.getByRole("link", { name: "جريش" }).click();
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByRole("region", { name: "فهمنا طلبك" })).toContainText(
    "جريش",
  );
  // صندوق البحث يحتفظ بجملة العميل كما كتبها.
  await expect(page.getByRole("searchbox").first()).toHaveValue(/جريش/);
});

test("a single word stays a plain search without the panel", async ({
  page,
}) => {
  await page.goto("/browse?q=" + encodeURIComponent("جريش"));
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("region", { name: "فهمنا طلبك" })).toHaveCount(0);
});

test("a dish with a place and a day: nothing missing, link to the dish guide", async ({
  page,
}) => {
  await page.goto(
    "/browse?q=" + encodeURIComponent("ابغى مرقوق بكرة في الرياض"),
  );
  const panel = page.getByRole("region", { name: "فهمنا طلبك" });
  await expect(panel).toContainText("مرقوق");
  await expect(panel).toContainText("بكرة");
  await expect(panel).not.toContainText("وش الأكلة");
  await expect(panel.getByRole("link", { name: "مرقوق" })).toHaveAttribute(
    "href",
    "/akalat/" + encodeURIComponent("مرقوق"),
  );
});
