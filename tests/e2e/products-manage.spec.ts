import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("jdatna:family-welcome", "1");
    } catch {}
  });
});

test("a family sees a clear add button, opens a category and hides or deletes a product", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "f",
          name: "أسرة",
          phone: "+966500000011",
          role: "producer",
          permissions: [],
        },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/producer/status", (r) =>
    r.fulfill({ json: { state: null, slug: "fam" } }),
  );
  const product = (id: string, name: string, cat: string, visible = true) => ({
    id,
    name,
    description: "وصف",
    price: 25,
    unit: "صحن",
    status: "available",
    categoryIds: [cat],
    visible,
    hiddenBy: visible ? null : "family",
  });
  let products = [
    product("00000000-0000-4000-8000-000000000001", "جريش", "c1"),
    product("00000000-0000-4000-8000-000000000002", "مرقوق", "c1"),
    product("00000000-0000-4000-8000-000000000003", "كليجا", "c2"),
  ];
  const sent: { id: string; action: string }[] = [];
  await page.route("**/api/producer/products", async (r) => {
    if (r.request().method() === "PUT") {
      const b = r.request().postDataJSON();
      sent.push(b);
      products =
        b.action === "delete"
          ? products.filter((p) => p.id !== b.id)
          : products.map((p) =>
              p.id === b.id
                ? {
                    ...p,
                    visible: b.action === "show",
                    hiddenBy: b.action === "show" ? null : "family",
                  }
                : p,
            );
      return r.fulfill({ json: { id: b.id } });
    }
    return r.fulfill({ json: { products } });
  });
  await page.route("**/api/producer/profile", (r) =>
    r.fulfill({
      json: {
        categories: [
          { id: "c1", name: "الأكلات الشعبية", slug: "c1", icon: "🍲" },
          { id: "c2", name: "الحلويات", slug: "c2", icon: "🍪" },
        ],
        profile: { categoryIds: ["c1", "c2"] },
      },
    }),
  );
  await page.goto("/dashboard/products");
  await expect(
    page.getByRole("button", { name: "إضافة منتج", exact: true }),
  ).toBeVisible();
  // القسم الأول مفتوح، والثاني يُفتح بالضغط.
  await expect(page.getByText("جريش", { exact: true })).toBeVisible();
  await expect(page.getByText("كليجا", { exact: true })).toBeHidden();
  await page.getByText("الحلويات").click();
  await expect(page.getByText("كليجا", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "إخفاء جريش" }).click();
  await expect(page.getByText("مخفي عن الزوار")).toBeVisible();
  await expect(page.getByRole("button", { name: "إظهار جريش" })).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "حذف مرقوق" }).click();
  await expect(page.getByText("مرقوق", { exact: true })).toHaveCount(0);
  expect(sent).toEqual([
    { id: "00000000-0000-4000-8000-000000000001", action: "hide" },
    { id: "00000000-0000-4000-8000-000000000002", action: "delete" },
  ]);
});
