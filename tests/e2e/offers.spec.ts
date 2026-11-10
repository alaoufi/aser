import { test, expect } from "@playwright/test";

// ترحيب الأسرة يُختبر في family-welcome.spec؛ هنا نعدّه ظاهرًا في هذه الزيارة.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("jdatna:family-welcome", "1");
    } catch {}
  });
});

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "أسرة الاختبار",
  phone: "+966500000001",
  role: "producer",
};
const productId = "00000000-0000-4000-8000-000000000002";
const offerId = "00000000-0000-4000-8000-000000000003";
for (const width of [320, 1280]) {
  test(`family creates targeted breakfast offer and disables it at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/session", (r) =>
      r.fulfill({ json: { user, registrationOpen: false } }),
    );
    await page.route("**/api/producer/products", (r) =>
      r.fulfill({
        json: { products: [{ id: productId, name: "فطور الأسرة المنتجة" }] },
      }),
    );
    let offers: Record<string, unknown>[] = [];
    let created: Record<string, unknown> | undefined;
    let patched: Record<string, unknown> | undefined;
    await page.route("**/api/producer/offers", async (route) => {
      const method = route.request().method();
      if (method === "GET") return route.fulfill({ json: { offers } });
      const body = route.request().postDataJSON();
      if (method === "POST") created = body;
      else patched = body;
      offers = [
        {
          ...body,
          id: offerId,
          producerName: user.name,
          producerSlug: "test-family",
        },
      ];
      await route.fulfill({ json: { id: offerId } });
    });
    await page.goto("/dashboard/offers");
    await page.getByRole("button", { name: "إضافة عرض" }).click();
    const form = page.locator("form");
    await expect(
      form.locator('select[name="audience"]').locator("option").first(),
    ).toHaveText("جمهور العرض");
    await expect(
      form.locator('select[name="meal"]').locator("option").first(),
    ).toHaveText("الوجبة أو المناسبة");
    await expect(
      form.locator('select[name="productId"]').locator("option").first(),
    ).toContainText("المنتج المرتبط");
    await form.getByLabel("عنوان العرض").fill("فطور للمهتمين بعروض الطلاب");
    await form.getByLabel("وصف العرض").fill("وجبة فطور يومية");
    await form
      .getByLabel("الشروط والاستحقاق")
      .fill("تتحقق الأسرة المنتجة من الاستحقاق مباشرة");
    await form.getByLabel("السعر بالريال").fill("15");
    await form.locator('select[name="productId"]').selectOption(productId);
    await form.locator('select[name="audience"]').selectOption("students");
    await form.locator('select[name="meal"]').selectOption("breakfast");
    await form.getByLabel("بداية العرض").fill("2026-11-08T08:00");
    await form.getByLabel("نهاية العرض").fill("2026-12-08T08:00");
    await form.getByLabel("تفعيل العرض").check();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await form.getByRole("button", { name: "حفظ العرض" }).click();
    await expect(
      page.getByRole("heading", { name: "فطور للمهتمين بعروض الطلاب" }),
    ).toBeVisible();
    expect(created).toMatchObject({
      audience: "students",
      meal: "breakfast",
      enabled: true,
      productId,
      price: 15,
    });
    await page.getByRole("button", { name: "تعطيل العرض" }).click();
    await expect(page.getByText("معطّل", { exact: true })).toBeVisible();
    expect(patched).toMatchObject({
      id: offerId,
      enabled: false,
      audience: "students",
      meal: "breakfast",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
test("member saves declared interests before targeted offers appear", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: { user: { ...user, role: "customer" }, registrationOpen: false },
    }),
  );
  let groups: string[] = [];
  await page.route("**/api/offers/preferences", async (r) => {
    if (r.request().method() === "PUT")
      groups = r.request().postDataJSON().groups;
    await r.fulfill({ json: { groups } });
  });
  await page.route("**/api/offers", (r) =>
    r.fulfill({
      json: {
        offers: groups.includes("students")
          ? [
              {
                id: offerId,
                title: "عرض الطلاب",
                description: "فطور يومي",
                terms: "التحقق لدى الأسرة المنتجة",
                price: 15,
                productId,
                audience: "students",
                meal: "breakfast",
                startsAt: "2026-11-08T00:00:00Z",
                endsAt: "2026-12-08T00:00:00Z",
                enabled: true,
                producerName: user.name,
                producerSlug: "test-family",
              },
            ]
          : [],
      },
    }),
  );
  await page.goto("/offers");
  await expect(
    page.getByRole("navigation", { name: "حسابي", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("لا توجد عروض متاحة حاليًا.")).toBeVisible();
  await expect(page.getByText(/اختيارك تصريح اهتمام شخصي/)).toBeVisible();
  await page.getByLabel("المهتمون بعروض الطلاب").check();
  await page
    .getByRole("button", { name: "حفظ الاهتمامات وعرض المناسب" })
    .click();
  await expect(page.getByRole("heading", { name: "عرض الطلاب" })).toBeVisible();
  expect(groups).toEqual(["students"]);
  await expect(
    page.getByRole("link", { name: "طلب المنتج بالعرض" }),
  ).toHaveAttribute("href", `/products/${productId}?offer=${offerId}`);
});
