import { test, expect, type Page } from "@playwright/test";

// ترحيب الأسرة يُختبر في family-welcome.spec؛ هنا نعدّه ظاهرًا في هذه الزيارة.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("jdatna:family-welcome", "1");
    } catch {}
  });
});

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
async function family(page: Page) {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "f1",
          name: "أسرة",
          phone: "+966500000003",
          role: "producer",
        },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/producer/status", (r) =>
    r.fulfill({ json: { state: null } }),
  );
  await page.route("**/api/producer/orders**", (r) =>
    r.fulfill({ json: { orders: [], alerts: [], pending: 0 } }),
  );
  await page.route("**/api/producer/profile", (r) =>
    r.fulfill({
      json: {
        profile: { id: "p1", categoryIds: ["2"] },
        categories: [
          { id: "1", name: "الأكلات الشعبية", slug: "a", icon: "✦" },
          { id: "2", name: "الجريش والقرصان", slug: "b", icon: "✦" },
        ],
        cities: [],
      },
    }),
  );
  await page.route("**/api/media/**", (r) =>
    r.fulfill({ body: png, contentType: "image/png" }),
  );
}
const photo = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "جريش بالدجاج",
  description: "صحن جريش أحمر",
  categoryId: "2",
  url: "/api/media/22222222-2222-4222-8222-222222222222",
  usedBy: 1,
};

test("family uploads dish photos with name, description and its own categories", async ({
  page,
}) => {
  await family(page);
  let uploaded: { name?: string; categoryId?: string } = {};
  const photos = [photo];
  await page.route("**/api/producer/library", async (r) => {
    if (r.request().method() === "POST") {
      const body = r.request().postData() ?? "";
      uploaded = {
        name: /name="name"\r\n\r\n([^\r]*)/.exec(body)?.[1],
        categoryId: /name="categoryId"\r\n\r\n([^\r]*)/.exec(body)?.[1],
      };
      photos.push({
        ...photo,
        id: "33333333-3333-4333-8333-333333333333",
        name: uploaded.name ?? "",
        usedBy: 0,
      });
      return r.fulfill({ status: 201, json: { id: "x" } });
    }
    return r.fulfill({ json: { photos } });
  });
  await page.goto("/dashboard/library");
  await expect(
    page.getByRole("heading", { name: "مكتبة الصور" }),
  ).toBeVisible();
  const list = page.getByRole("list", { name: "صور مكتبتي" });
  await expect(list.getByRole("img", { name: "جريش بالدجاج" })).toBeVisible();
  // صورة مستخدمة في منتج لا تُحذف.
  await expect(
    page.getByRole("button", { name: "حذف جريش بالدجاج" }),
  ).toBeDisabled();
  // أقسام الصورة من أقسام الأسرة فقط.
  const category = page.locator("#library-new-category");
  await expect(category.locator("option")).toHaveText([
    "بدون قسم",
    "الجريش والقرصان",
  ]);
  await page.locator('input[name="file"]').setInputFiles({
    name: "dish.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByLabel("اسم الطبق").fill("قرصان");
  await category.selectOption("2");
  await page.getByRole("button", { name: "رفع إلى المكتبة" }).click();
  await expect(page.getByText("تمت إضافة الصورة إلى مكتبتك.")).toBeVisible();
  expect(uploaded).toEqual({ name: "قرصان", categoryId: "2" });
  await expect(list.getByRole("img", { name: "قرصان" })).toBeVisible();
});

test("adding a product picks its photo from the library and fills the dish details", async ({
  page,
}) => {
  await family(page);
  await page.route("**/api/producer/library", (r) =>
    r.fulfill({ json: { photos: [{ ...photo, usedBy: 0 }] } }),
  );
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/producer/products", async (r) => {
    if (r.request().method() === "POST") {
      saved = r.request().postDataJSON();
      return r.fulfill({ json: { id: "n1" } });
    }
    return r.fulfill({ json: { products: [] } });
  });
  await page.goto("/dashboard/products");
  await page.getByRole("button", { name: "+ إضافة منتج" }).click();
  await page.getByRole("radio", { name: /جريش بالدجاج/ }).check();
  await expect(page.getByLabel("اسم المنتج")).toHaveValue("جريش بالدجاج");
  await expect(
    page.getByRole("checkbox", { name: "الجريش والقرصان" }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "الأكلات الشعبية" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("تفاصيل المنتج")).toHaveValue("صحن جريش أحمر");
  await page.getByLabel("وحدة البيع").fill("صحن");
  await page.getByLabel("السعر بالريال").fill("25");
  await page.getByRole("button", { name: "حفظ المنتج" }).click();
  await expect.poll(() => saved).toBeTruthy();
  expect(saved).toMatchObject({
    name: "جريش بالدجاج",
    categoryIds: ["2"],
    libraryPhotoId: photo.id,
  });
});

test("saving family categories confirms right beside the save button", async ({
  page,
}) => {
  await family(page);
  await page.route("**/api/producer/categories", (r) =>
    r.fulfill({ json: { categoryIds: ["2"] } }),
  );
  await page.route("**/api/producer/availability", (r) =>
    r.fulfill({ json: { day: "2026-11-10", notCookingToday: false } }),
  );
  await page.goto("/dashboard");
  const card = page.getByRole("region", { name: "أقسام منتجاتي" });
  await card.getByRole("button", { name: "حفظ أقسامي" }).click();
  const status = card.getByRole("status");
  await expect(status).toHaveText("تم حفظ أقسام منتجاتك.");
  await expect(status).toBeInViewport();
});
