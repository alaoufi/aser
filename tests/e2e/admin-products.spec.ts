import { test, expect } from "@playwright/test";

test("admin products: explained, searchable, and each product can be hidden, featured, deleted or its family blocked", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "a",
          name: "المدير",
          phone: "+966500000031",
          role: "admin",
          permissions: [],
        },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/admin/categories", (r) =>
    r.fulfill({ json: { categories: [] } }),
  );
  const mk = (id: string, name: string, producerName: string) => ({
    id,
    name,
    producerId: "f" + id.slice(-1),
    producerName,
    producerStatus: "approved",
    cityName: "الرياض",
    status: "available",
    visible: true,
    featured: false,
    hiddenBy: null as string | null,
    categoryIds: [] as string[],
  });
  let products = [
    mk("00000000-0000-4000-8000-000000000001", "جريش", "مطبخ أم سعد"),
    mk("00000000-0000-4000-8000-000000000002", "كليجا", "بيت الكليجا"),
  ];
  const sent: Record<string, unknown>[] = [];
  await page.route("**/api/admin/products", async (r) => {
    if (r.request().method() === "PATCH") {
      const b = r.request().postDataJSON();
      sent.push(b);
      products = b.deleted
        ? products.filter((p) => p.id !== b.id)
        : products.map((p) =>
            p.id === b.id
              ? {
                  ...p,
                  ...(b.visible !== undefined
                    ? {
                        visible: b.visible,
                        hiddenBy: b.visible ? null : "admin",
                      }
                    : {}),
                  ...(b.featured !== undefined ? { featured: b.featured } : {}),
                }
              : p,
          );
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: { products } });
  });
  let review: unknown;
  await page.route("**/api/admin/producers/*/review", async (r) => {
    review = r.request().postDataJSON();
    products = products.map((p) =>
      p.producerName === "بيت الكليجا"
        ? { ...p, producerStatus: "suspended" }
        : p,
    );
    await r.fulfill({ json: { status: "suspended" } });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "المنتجات", exact: true }).click();
  const box = page.getByRole("region", { name: "المنتجات" });
  await expect(box).toContainText("حظر الأسرة");
  await box.getByLabel("بحث باسم المنتج أو الأسرة").fill("كليجا");
  await expect(box.getByRole("button", { name: "إخفاء جريش" })).toHaveCount(0);
  await box.getByLabel("بحث باسم المنتج أو الأسرة").fill("");

  page.once("dialog", (d) => d.accept("صور مضللة للمنتج"));
  await box.getByRole("button", { name: "إخفاء جريش" }).click();
  await expect(box.getByText("مخفي من الإدارة")).toBeVisible();
  await box.getByRole("button", { name: "تمييز جريش" }).click();
  await expect(
    box.getByRole("button", { name: "إلغاء تمييز جريش" }),
  ).toBeVisible();

  page.once("dialog", (d) => d.accept("مخالفة الشروط"));
  await box.getByRole("button", { name: "حظر أسرة بيت الكليجا" }).click();
  await expect(box.getByText("الأسرة موقوفة")).toBeVisible();
  expect(review).toEqual({ decision: "suspended", reason: "مخالفة الشروط" });

  // إلغاء نافذة السبب لا يحذف.
  page.once("dialog", (d) => d.dismiss());
  await box.getByRole("button", { name: "حذف كليجا" }).click();
  page.once("dialog", (d) => d.accept("منتج مكرر"));
  await box.getByRole("button", { name: "حذف كليجا" }).click();
  await expect(box.getByRole("button", { name: "حذف كليجا" })).toHaveCount(0);
  expect(sent).toEqual([
    { id: products[0].id, visible: false, reason: "صور مضللة للمنتج" },
    { id: products[0].id, featured: true, reason: "تمييز المنتج في الواجهة" },
    {
      id: "00000000-0000-4000-8000-000000000002",
      deleted: true,
      reason: "منتج مكرر",
    },
  ]);
});
