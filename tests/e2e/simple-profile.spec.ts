import { test, expect } from "@playwright/test";
const user = {
  id: "simple-family-user",
  name: "اسم الأسرة",
  phone: "+966500000001",
  role: "customer",
};
const city = {
  id: "city-test",
  name: "الرياض",
  regionId: "riyadh",
  regionName: "منطقة الرياض",
};
test("family saves only basic fields in one form and retries without reuploading license", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user, registrationOpen: true } }),
  );
  let profile: any = null,
    posted: any,
    attempts = 0,
    uploads = 0;
  await page.route("**/api/producer/profile", async (r) => {
    if (r.request().method() === "POST") {
      attempts++;
      posted = r.request().postDataJSON();
      if (attempts === 1)
        return r.fulfill({
          status: 503,
          json: { error: "تعذر حفظ ملف الأسرة" },
        });
      profile = {
        ...posted,
        id: "00000000-0000-4000-8000-000000000001",
        categoryIds: ["12"],
        pickup: true,
        delivery: false,
        status: "pending",
      };
      return r.fulfill({ json: { id: profile.id, status: "pending" } });
    }
    return r.fulfill({
      json: {
        profile,
        categories: [
          { id: "12", name: "منتجات غذائية أخرى", slug: "general", icon: "✦" },
        ],
        cities: [city],
      },
    });
  });
  await page.route("**/api/documents", (r) => {
    uploads++;
    return r.fulfill({ json: { id: "00000000-0000-4000-8000-000000000002" } });
  });
  await page.route("**/api/producer/availability", (r) =>
    r.fulfill({ json: { day: "2026-11-08", notCookingToday: false } }),
  );
  await page.goto("/register");
  await expect(page.locator("form")).toHaveCount(1);
  await expect(
    page.locator('details:has(summary:text-is("تفاصيل إضافية (اختيارية)"))'),
  ).not.toHaveAttribute("open", "");
  await expect(page.getByLabel("نبذة عن الأسرة")).toHaveCount(0);
  await expect(page.getByLabel("الاسم", { exact: true })).toHaveValue(
    user.name,
  );
  await page.getByLabel("رقم الهوية", { exact: true }).fill("١٢٣٤٥٦٧٨٩٠");
  await expect(page.locator("input[name=phone]")).toHaveAttribute(
    "readonly",
    "",
  );
  await page
    .locator("input[name=file]")
    .setInputFiles({
      name: "activity-license.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 private test"),
    });
  await page
    .getByRole("combobox", { name: "المنطقة", exact: true })
    .selectOption("riyadh");
  await page
    .getByRole("combobox", { name: "المدينة", exact: true })
    .selectOption(city.id);
  await page
    .getByLabel("عنوان أو رابط موقع العمل", { exact: true })
    .fill("عنوان عمل خاص لا يظهر للزوار");
  await page
    .getByRole("button", { name: "حفظ وإرسال للمراجعة", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "تعذر حفظ ملف الأسرة",
  );
  expect(uploads).toBe(1);
  await page
    .getByRole("button", { name: "حفظ وإرسال للمراجعة", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "تم حفظ البيانات" }),
  ).toBeVisible();
  expect(uploads).toBe(1);
  expect(attempts).toBe(2);
  expect(posted).toEqual({
    name: user.name,
    phone: user.phone,
    cityId: city.id,
    nationalId: "١٢٣٤٥٦٧٨٩٠",
    workLocation: "عنوان عمل خاص لا يظهر للزوار",
    documentType: "other_document",
    documentId: "00000000-0000-4000-8000-000000000002",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
