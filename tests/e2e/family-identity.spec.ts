import { expect, test } from "@playwright/test";
import { tablePresets } from "../../src/lib/family-table";

/**
 * «هوية الأسرة» تبويب مستقل في لوحة الأسرة (طلب المالك 2026-11-26)، وتحته: بيانات الأسرة،
 * والألوان والزخرفة، والمائدة، والموقع، وظهور التواصل. رئيسية اللوحة تبقى لعمل اليوم.
 */
const family = {
  id: "fi",
  name: "مطبخ أم سعد",
  phone: "+966500000083",
  role: "producer",
  familyName: "مطبخ أم سعد",
};
test("the family identity tab holds data, colours, table, location and contact", async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("jdatna:family-welcome", "1"),
  );
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: family, registrationOpen: true } }),
  );
  await page.route("**/api/producer/profile", (r) =>
    r.fulfill({
      json: {
        profile: {
          id: "00000000-0000-4000-8000-000000000083",
          name: family.name,
          tradeName: family.name,
          cityId: "riyadh",
          categoryIds: [],
          pickup: true,
          delivery: false,
          status: "approved",
        },
        categories: [],
        cities: [],
      },
    }),
  );
  await page.route("**/api/producer/availability", (r) =>
    r.fulfill({ json: { day: "2026-11-26", notCookingToday: false } }),
  );
  await page.route("**/api/producer/fulfillment", (r) =>
    r.fulfill({
      json: { pickup: true, delivery: false, pickupLocation: "حي" },
    }),
  );
  await page.route("**/api/producer/contact", (r) =>
    r.fulfill({
      json: {
        showPhone: true,
        showWhatsapp: true,
        phone: family.phone,
        whatsapp: null,
      },
    }),
  );
  await page.route("**/api/producer/brand", (r) =>
    r.fulfill({
      json: {
        producerId: "00000000-0000-4000-8000-000000000083",
        palette: "c4-7",
        pattern: "dots-g-2-0",
        effect: "soft",
        scale: 2,
        chosen: false,
        tier: "free",
        taken: [],
      },
    }),
  );
  await page.route("**/api/producer/table", (r) =>
    r.fulfill({
      json: {
        name: family.name,
        chosen: false,
        table: tablePresets.classic,
        welcome: "",
        dishes: [],
      },
    }),
  );
  await page.goto("/dashboard");
  // رئيسية اللوحة بلا نموذج البيانات ولا بطاقات الهوية.
  await expect(
    page.getByRole("heading", { name: "بيانات الأسرة المنتجة" }),
  ).toHaveCount(0);
  await expect(page.getByRole("region", { name: "مائدة الأسرة" })).toHaveCount(
    0,
  );
  await page
    .getByRole("navigation", { name: "أقسام الأسرة المنتجة" })
    .getByRole("link", { name: "هوية الأسرة" })
    .or(page.getByRole("tab", { name: "هوية الأسرة" }))
    .first()
    .click();
  await expect(page).toHaveURL(/\/dashboard\/identity$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "هوية الأسرة" }),
  ).toBeVisible();
  // الأول «بيانات الأسرة».
  await expect(
    page.getByRole("heading", { name: "بيانات الأسرة المنتجة" }),
  ).toBeVisible();
  const parts: [string, string, string][] = [
    ["الألوان والزخرفة", "brand", "الألوان والزخرفة"],
    ["المائدة", "table", "مائدة الأسرة"],
    ["الموقع", "location", "طرق التسليم"],
    ["ظهور التواصل", "contact", "ظهور بيانات التواصل للعملاء"],
  ];
  for (const [tab, hash, region] of parts) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#${hash}$`));
    await expect(page.getByRole("region", { name: region })).toBeVisible();
  }
  // الرابط المباشر يفتح القسم نفسه.
  await page.goto("/dashboard/identity#table");
  await expect(
    page.getByRole("tab", { name: "المائدة", selected: true }),
  ).toBeVisible();
  await page
    .getByRole("heading", { level: 1, name: "هوية الأسرة" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `test-results/family-identity-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
