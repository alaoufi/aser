import { test, expect } from "@playwright/test";

test("unavailable verification disables sending and explains registration status", async ({
  page,
}) => {
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { user: null, registrationOpen: false } }),
  );
  for (const path of ["/login", "/register"]) {
    await page.goto(path);
    await expect(
      page.getByRole("button", { name: "أرسل رمز التحقق" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("status").filter({ hasText: "غير متاحين حاليًا" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("customer sees explicit admin denial and no document or decision controls", async ({
  page,
}) => {
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "test-user",
          name: "عميل الاختبار",
          phone: "0500000000",
          role: "customer",
        },
        registrationOpen: false,
      },
    }),
  );
  await page.goto("/admin");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "ليست لديك صلاحية الوصول",
  );
  await expect(
    page.getByRole("button", { name: "حفظ قرار المراجعة" }),
  ).toHaveCount(0);
});

test("phone verification moves to code entry and reports server failure", async ({
  page,
}) => {
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { user: null, registrationOpen: true } }),
  );
  await page.route("**/api/auth/request-otp", (route) =>
    route.fulfill({ json: { challengeId: "test-challenge" } }),
  );
  await page.route("**/api/auth/verify-otp", (route) =>
    route.fulfill({ status: 400, json: { error: "رمز التحقق غير صحيح" } }),
  );
  await page.goto("/login");
  await page.getByLabel("رقم الجوال").fill("0500000000");
  await page.getByRole("button", { name: "أرسل رمز التحقق" }).click();
  await expect(page.getByLabel("رمز التحقق", { exact: true })).toHaveAttribute(
    "maxlength",
    "4",
  );
  await expect(page.getByLabel("رمز التحقق", { exact: true })).toHaveAttribute(
    "pattern",
    "[0-9]{4}",
  );
  await page.getByLabel("رمز التحقق", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "تحقق ومتابعة" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "رمز التحقق غير صحيح",
  );
  await expect(page.locator("main").getByRole("alert")).toBeFocused();
});

test("admin category validates slug before sending and preserves errors from server", async ({
  page,
}) => {
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "admin-test",
          name: "إدارة الاختبار",
          phone: "0500000000",
          role: "admin",
        },
        registrationOpen: false,
      },
    }),
  );
  await page.route("**/api/admin/producers", (route) =>
    route.fulfill({ json: { producers: [] } }),
  );
  await page.route("**/api/admin/categories", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { categories: [] } })
      : route.fulfill({ status: 409, json: { error: "التصنيف مسجل مسبقًا" } }),
  );
  await page.goto("/admin");
  await page.getByRole("button", { name: "التصنيفات", exact: true }).click();
  await page.getByLabel("اسم التصنيف").fill("الخبز");
  const slug = page.getByLabel("الرابط المختصر");
  await slug.fill("Invalid Slug");
  expect(
    await slug.evaluate((el: HTMLInputElement) => el.validity.patternMismatch),
  ).toBe(true);
  await slug.fill("bread");
  await page.getByRole("button", { name: "حفظ التصنيف" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "التصنيف مسجل مسبقًا",
  );
  await expect(page.getByLabel("اسم التصنيف")).toHaveValue("الخبز");
});

test("profile validates working hours and sends optional links and city fees", async ({
  page,
}) => {
  const user = {
    id: "producer-test",
    name: "أسرة الاختبار",
    phone: "0500000000",
    role: "producer",
  };
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { user, registrationOpen: true } }),
  );
  let saved: Record<string, unknown> | null = null;
  await page.route("**/api/producer/profile", async (route) => {
    if (route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: {
        profile: {
          name: "أسرة الاختبار",
          cityId: "riyadh",
          phone: user.phone,
          categoryIds: ["food"],
          documentId: "private-doc",
          documentType: "producer_certificate",
          delivery: true,
          pickup: true,
          socialLinks: [],
          businessHours: [],
          deliveryAreas: [],
        },
        categories: [{ id: "food", name: "الطعام", slug: "food", icon: "✦" }],
        cities: [
          {
            id: "riyadh",
            name: "الرياض",
            regionId: "central",
            regionName: "منطقة الرياض",
          },
        ],
      },
    });
  });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("combobox", { name: "المنطقة", exact: true }),
  ).toHaveValue("central");
  await expect(
    page.getByRole("combobox", { name: "المدينة", exact: true }),
  ).toHaveValue("riyadh");
  await page
    .getByRole("combobox", { name: "المنطقة", exact: true })
    .selectOption("");
  await expect(
    page.getByRole("combobox", { name: "المدينة", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("combobox", { name: "المنطقة", exact: true })
    .selectOption("central");
  await expect(
    page.getByRole("combobox", { name: "المدينة", exact: true }),
  ).toHaveValue("");
  await page
    .getByRole("combobox", { name: "المدينة", exact: true })
    .selectOption("riyadh");
  await page.getByRole("checkbox", { name: "الأحد", exact: true }).check();
  await page.getByLabel("بداية الأحد").fill("18:00");
  await page.getByLabel("نهاية الأحد").fill("09:00");
  await page.getByRole("button", { name: "حفظ وإرسال للمراجعة" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "بداية ونهاية صحيحتين",
  );
  expect(saved).toBeNull();
  await page.getByLabel("نهاية الأحد").fill("20:00");
  await page
    .getByLabel("إنستغرام", { exact: true })
    .fill("https://www.instagram.com/example");
  await page
    .getByRole("checkbox", { name: "الرياض — منطقة الرياض", exact: true })
    .check();
  await page.getByLabel("رسوم توصيل الرياض (ر.س)").fill("15");
  await page.getByRole("button", { name: "حفظ وإرسال للمراجعة" }).click();
  await expect(page.locator("main").getByRole("status")).toContainText(
    "تم حفظ بيانات الأسرة",
  );
  expect(saved).toMatchObject({
    socialLinks: [
      { platform: "instagram", url: "https://www.instagram.com/example" },
    ],
    businessHours: [{ day: 0, opens: "18:00", closes: "20:00" }],
    deliveryAreas: [{ cityId: "riyadh", fee: 15 }],
  });
});

test("product photo reports unavailable storage without claiming success", async ({
  page,
}) => {
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "producer-test",
          name: "أسرة الاختبار",
          phone: "0500000000",
          role: "producer",
        },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/producer/profile", (route) =>
    route.fulfill({ json: { categories: [], cities: [], profile: null } }),
  );
  await page.route("**/api/producer/products", (route) =>
    route.fulfill({
      json: {
        products: [
          {
            id: "product-test",
            name: "الخبز",
            description: "خبز طازج",
            price: 10,
            unit: "حبة",
            status: "available",
            imageUrl: null,
            categoryIds: [],
            allergens: [],
          },
        ],
      },
    }),
  );
  await page.route("**/api/producer/products/product-test/image", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "تخزين الصور غير متاح حاليًا" },
    }),
  );
  await page.goto("/dashboard/products");
  await page
    .getByLabel("صورة المنتج · JPEG أو PNG حتى 5 ميجابايت")
    .setInputFiles({
      name: "photo.png",
      mimeType: "image/png",
      buffer: Buffer.from("mock-image"),
    });
  await page.getByRole("button", { name: "رفع الصورة", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "تخزين الصور غير متاح حاليًا",
  );
  await expect(
    page.getByText("تم حفظ صورة المنتج.", { exact: true }),
  ).toHaveCount(0);
});
