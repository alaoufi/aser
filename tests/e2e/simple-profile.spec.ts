import { test, expect } from "@playwright/test";
const user = {
  id: "simple-family-user",
  name: "اسم الأسرة المنتجة",
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
  // بعد حفظ ملف الأسرة المنتجة يرقّي الخادم الحساب إلى producer، كما في الإنتاج.
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: profile ? { ...user, role: "producer" } : user,
        registrationOpen: true,
      },
    }),
  );
  // حالة الحساب: لا ملف قبل التسجيل، ثم «تحت المراجعة» بعده.
  await page.route("**/api/producer/status", (r) =>
    r.fulfill({
      json: {
        state: profile
          ? {
              key: "review",
              label: "تحت المراجعة",
              detail: "تم التسجيل وطلبك الآن تحت المراجعة.",
            }
          : null,
      },
    }),
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
          json: { error: "تعذر حفظ ملف الأسرة المنتجة" },
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
  await expect(page.getByLabel("نبذة عن الأسرة المنتجة")).toHaveCount(0);
  await expect(page.getByLabel("الاسم الحقيقي", { exact: true })).toHaveValue(
    user.name,
  );
  // الاسم المعلن (الظاهر للعملاء) مطلوب، والاسم للإدارة فقط.
  await expect(
    page.getByLabel("الاسم التجاري المعلن", { exact: true }),
  ).toHaveAttribute("required", "");
  await page
    .getByRole("button", { name: "حفظ وإرسال للمراجعة", exact: true })
    .click();
  // النموذج الفارغ: قائمة بالنواقص كلها بأسمائها، والضغط على البند ينقل لحقله.
  const missing = page.locator("main").getByRole("alert");
  await expect(missing).toContainText("قبل الإرسال");
  await expect(missing).toContainText("الاسم التجاري المعلن: مطلوب");
  await expect(missing).toContainText("رقم الهوية: مطلوب");
  await expect(missing).toContainText("المنطقة: لم يُختر بعد");
  await expect(missing).toContainText("عنوان أو رابط موقع العمل: مطلوب");
  await missing.getByRole("button", { name: "رقم الهوية" }).click();
  await expect(page.getByLabel("رقم الهوية", { exact: true })).toBeFocused();
  await page
    .getByLabel("الاسم التجاري المعلن", { exact: true })
    .fill("مذاق الأسرة المنتجة التجريبي");
  await page.getByLabel("رقم الهوية", { exact: true }).fill("١٢٣٤٥٦٧٨٩٠");
  await expect(page.locator("input[name=phone]")).toHaveAttribute(
    "readonly",
    "",
  );
  // المرفق اختياري (شهادة أو صورة الهوية)، والتسجيل يُقبل دونه.
  await expect(page.locator("input[name=file]")).not.toHaveAttribute(
    "required",
    "",
  );
  await expect(
    page.getByRole("combobox", { name: "نوع المرفق", exact: true }),
  ).toHaveValue("producer_certificate");
  await page.locator("input[name=file]").setInputFiles({
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
  // أقسام المنتجات مطلوبة عند التسجيل، ويُرفض الحفظ قبل أي رفع.
  await page
    .getByRole("button", { name: "حفظ وإرسال للمراجعة", exact: true })
    .click();
  // رسالة النواقص الواضحة: بند واحد باقٍ.
  const issues = page.locator("main").getByRole("alert");
  await expect(issues).toContainText("بقي شيء واحد قبل الإرسال");
  await expect(issues).toContainText(
    "أقسام منتجاتك: اختر قسمًا واحدًا على الأقل",
  );
  expect(uploads).toBe(0);
  await page.getByRole("checkbox", { name: "منتجات غذائية أخرى" }).check();
  await page
    .getByRole("button", { name: "حفظ وإرسال للمراجعة", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "تعذر حفظ ملف الأسرة المنتجة",
  );
  expect(uploads).toBe(1);
  await page
    .getByRole("button", { name: "حفظ وإرسال للمراجعة", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "تم تسجيل أسرتك بنجاح" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "حالة حساب الأسرة المنتجة" }),
  ).toContainText("حالة الحساب: تحت المراجعة");
  // بعد التسجيل: الأقسام تُعدَّل من بطاقة مستقلة.
  await expect(
    page
      .getByRole("region", { name: "أقسام منتجاتي" })
      .getByRole("checkbox", { name: "منتجات غذائية أخرى" }),
  ).toBeChecked();
  expect(uploads).toBe(1);
  expect(attempts).toBe(2);
  expect(posted).toEqual({
    categoryIds: ["12"],
    deliveryScope: "coverage",
    shippingFee: null,
    name: user.name,
    tradeName: "مذاق الأسرة المنتجة التجريبي",
    phone: user.phone,
    cityId: city.id,
    nationalId: "١٢٣٤٥٦٧٨٩٠",
    workLocation: "عنوان عمل خاص لا يظهر للزوار",
    documentType: "producer_certificate",
    documentId: "00000000-0000-4000-8000-000000000002",
    pledge: false,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

// الاسم التجاري المعلن المكرر: رسالة فورية أثناء الكتابة قبل الحفظ.
test("a taken public name shows «هذا الاسم مستخدم، اختر اسمًا آخر» while typing", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user, registrationOpen: true } }),
  );
  await page.route("**/api/producer/status", (r) =>
    r.fulfill({ json: { state: null } }),
  );
  await page.route("**/api/producer/profile", (r) =>
    r.fulfill({ json: { profile: null, categories: [], cities: [city] } }),
  );
  await page.route("**/api/producer/trade-name**", (r) => {
    const name = new URL(r.request().url()).searchParams.get("name");
    return r.fulfill({
      json:
        name === "مذاق جدتي"
          ? { available: false, message: "هذا الاسم مستخدم، اختر اسمًا آخر" }
          : { available: true },
    });
  });
  await page.goto("/register");
  const field = page.getByLabel("الاسم التجاري المعلن", { exact: true });
  await field.fill("مذاق جدتي");
  await expect(
    page.getByText("هذا الاسم مستخدم، اختر اسمًا آخر"),
  ).toBeVisible();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await field.fill("مذاق جدتي الأصيل");
  await expect(page.getByText("هذا الاسم مستخدم، اختر اسمًا آخر")).toHaveCount(
    0,
  );
});

// موقع العمل يُحدَّد تلقائيًا عند فتح التسجيل، ويبقى قابلًا للتعديل.
test.describe("work location is detected automatically", () => {
  test.use({
    permissions: ["geolocation"],
    geolocation: { latitude: 26.3592, longitude: 43.9818 },
  });
  test("the family's work location fills itself and can be edited", async ({
    page,
  }) => {
    await page.route("**/api/session", (r) =>
      r.fulfill({ json: { user, registrationOpen: true } }),
    );
    await page.route("**/api/producer/status", (r) =>
      r.fulfill({ json: { state: null } }),
    );
    await page.route("**/api/producer/profile", (r) =>
      r.fulfill({ json: { profile: null, categories: [], cities: [city] } }),
    );
    await page.goto("/register");
    const field = page.getByLabel("عنوان أو رابط موقع العمل", { exact: true });
    await expect(field).toHaveValue(
      "https://maps.google.com/?q=26.359200,43.981800",
    );
    await expect(page.getByText(/حُدد موقعك الحالي تلقائيًا ✓/)).toBeVisible();
    await field.fill("حي الريان، شارع الأسرة");
    await expect(field).toHaveValue("حي الريان، شارع الأسرة");
  });
});

// قرار المالك 2026-11-26: بلا مستند الآن يلزم التعهد بتقديمه خلال 15 يومًا، فتُعتمد الأسرة فورًا.
test("registering without a document needs the 15-day pledge, and the family is active at once", async ({
  page,
}) => {
  let profile: any = null,
    posted: any;
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: profile ? { ...user, role: "producer" } : user,
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/producer/status", (r) =>
    r.fulfill({ json: { state: null } }),
  );
  await page.route("**/api/producer/profile", async (r) => {
    if (r.request().method() === "POST") {
      posted = r.request().postDataJSON();
      profile = {
        ...posted,
        id: "00000000-0000-4000-8000-000000000009",
        categoryIds: ["12"],
        pickup: true,
        delivery: false,
        status: "approved",
        docs_due_at: "2026-12-11T12:00:00Z",
      };
      return r.fulfill({ json: { id: profile.id, status: "approved" } });
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
  await page.route("**/api/producer/availability", (r) =>
    r.fulfill({ json: { day: "2026-11-26", notCookingToday: false } }),
  );
  await page.goto("/register");
  await page
    .getByLabel("الاسم التجاري المعلن", { exact: true })
    .fill("شاهي أم فهد");
  await page.getByLabel("رقم الهوية", { exact: true }).fill("1234567890");
  await page
    .getByRole("combobox", { name: "المنطقة", exact: true })
    .selectOption("riyadh");
  await page
    .getByRole("combobox", { name: "المدينة", exact: true })
    .selectOption(city.id);
  await page
    .getByLabel("عنوان أو رابط موقع العمل", { exact: true })
    .fill("عنوان عمل خاص لا يظهر للزوار");
  await page.getByRole("checkbox", { name: "منتجات غذائية أخرى" }).check();
  const save = page.getByRole("button", {
    name: "حفظ وإرسال للمراجعة",
    exact: true,
  });
  await save.click();
  // لا مستند ولا تعهد: رسالة واضحة ولا إرسال.
  await expect(
    page.getByText("ارفع المستند الآن، أو اختر التعهد بتقديمه خلال 15 يومًا."),
  ).toBeVisible();
  expect(posted).toBeUndefined();
  const pledge = page.getByRole("checkbox", { name: /أتعهد بتقديم المستندات/ });
  await pledge.check();
  await page.screenshot({
    path: "test-results/family-pledge.png",
    fullPage: true,
  });
  await save.click();
  await expect.poll(() => posted?.pledge).toBe(true);
  expect(posted.documentId).toBeNull();
  await expect(page.getByText(/صارت ظاهرة للعملاء بكل صلاحيات/)).toBeVisible();
  // التذكير بموعد المستندات.
  await expect(
    page.getByText(/تعهدت بتقديم المستندات الرسمية لممارسة النشاط قبل/),
  ).toBeVisible();
});
