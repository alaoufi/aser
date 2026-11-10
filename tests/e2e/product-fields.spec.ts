import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const as = (page: Page, role: "admin" | "producer") =>
  page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: role,
          name: role === "admin" ? "المدير" : "أسرة",
          phone: "+966500000021",
          role,
          permissions: [],
        },
        registrationOpen: true,
      },
    }),
  );

test("the admin hides, deletes and restores product form fields from category management", async ({
  page,
}) => {
  await as(page, "admin");
  await page.route("**/api/admin/categories", (r) =>
    r.fulfill({ json: { categories: [] } }),
  );
  const fields: Record<string, string> = {
    library: "shown",
    unit: "shown",
    status: "shown",
    price: "shown",
    description: "shown",
    deliveryScope: "shown",
    allergens: "shown",
    ingredients: "shown",
    storage: "shown",
    shelfLife: "shown",
    preparationTime: "shown",
    story: "shown",
  };
  const sent: unknown[] = [];
  await page.route("**/api/admin/product-fields", async (r) => {
    if (r.request().method() === "PUT") {
      const b = r.request().postDataJSON();
      sent.push(b);
      fields[b.key] = b.state;
    }
    await r.fulfill({ json: { fields } });
  });
  await page.goto("/admin");
  await page
    .getByRole("button", { name: "إدارة الأقسام", exact: true })
    .click();
  const box = page.getByRole("region", { name: "حقول إضافة المنتج" });
  await box.getByRole("button", { name: "إخفاء حقل المكونات" }).click();
  await expect(box.getByText("· مخفي")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await box.getByRole("button", { name: "حذف حقل قصة الأكلة" }).click();
  await expect(
    box.getByRole("button", { name: "استعادة حقل قصة الأكلة" }),
  ).toBeVisible();
  await expect(page.getByRole("status").getByText("تم الحفظ")).toBeVisible();
  await box.getByRole("button", { name: "استعادة حقل قصة الأكلة" }).click();
  expect(sent).toEqual([
    { key: "ingredients", state: "hidden" },
    { key: "story", state: "deleted" },
    { key: "story", state: "shown" },
  ]);
});

test("a family's add-product form leaves out the fields the admin hid or deleted", async ({
  page,
}) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("jdatna:family-welcome", "1");
    } catch {}
  });
  await as(page, "producer");
  await page.route("**/api/producer/status", (r) =>
    r.fulfill({ json: { state: null, slug: "fam" } }),
  );
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/producer/products", async (r) => {
    if (r.request().method() === "POST") {
      saved = r.request().postDataJSON();
      return r.fulfill({ json: { id: "x" } });
    }
    return r.fulfill({
      json: {
        products: [],
        fields: {
          library: "shown",
          unit: "hidden",
          status: "shown",
          price: "shown",
          description: "deleted",
          deliveryScope: "shown",
          allergens: "shown",
          ingredients: "hidden",
          storage: "shown",
          shelfLife: "shown",
          preparationTime: "shown",
          story: "deleted",
        },
      },
    });
  });
  await page.route("**/api/producer/profile", (r) =>
    r.fulfill({
      json: {
        categories: [{ id: "c1", name: "الحلويات", slug: "c1", icon: "🍪" }],
        profile: { categoryIds: ["c1"] },
      },
    }),
  );
  await page.goto("/dashboard/products");
  await page.getByRole("button", { name: "إضافة منتج", exact: true }).click();
  const form = page.locator("form[data-product-form]");
  await expect(form.getByLabel("اسم المنتج")).toBeVisible();
  for (const gone of ["وحدة البيع", "تفاصيل المنتج", "المكونات", "قصة الأكلة"])
    await expect(form.getByLabel(gone)).toHaveCount(0);
  await expect(form.getByLabel("مدة الصلاحية")).toBeVisible();
  await form.getByLabel("اسم المنتج").fill("معمول");
  await form.getByLabel("السعر بالريال").fill("30");
  await form.getByLabel("الحلويات").check();
  await form.getByRole("button", { name: "حفظ المنتج" }).click();
  await expect.poll(() => saved?.name).toBe("معمول");
  expect(saved).toMatchObject({ unit: "طبق", description: "", price: 30 });
  expect(saved?.story).toBeNull();
});
