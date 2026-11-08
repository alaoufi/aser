import { test, expect } from "@playwright/test";
const user = {
  id: "auth-ui-test",
  name: "عميل الاختبار",
  phone: "+966500000001",
  role: "customer",
  username: null,
};
test("password login works while SMS unavailable and follows server destination", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: null, registrationOpen: false } }),
  );
  let payload: unknown;
  await page.route("**/api/auth/password-login", (r) => {
    payload = r.request().postDataJSON();
    return r.fulfill({
      json: { user: { ...user, role: "admin" }, next: "/admin" },
    });
  });
  await page.route("**/api/admin/**", (r) =>
    r.fulfill({
      json: {
        producers: [],
        products: [],
        categories: [],
        regions: [],
        cities: [],
        neighborhoods: [],
        reports: [],
      },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("اسم المستخدم أو رقم الجوال").fill("admin.user");
  await page
    .getByLabel("كلمة المرور", { exact: true })
    .fill("correct-password");
  await expect(
    page.getByRole("button", { name: "دخول", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  expect(payload).toEqual({
    identifier: "admin.user",
    password: "correct-password",
  });
});
test("family signup can optionally create credentials before application", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: null, registrationOpen: true } }),
  );
  await page.route("**/api/auth/request-otp", (r) =>
    r.fulfill({ json: { challengeId: "test-challenge" } }),
  );
  await page.route("**/api/auth/verify-otp", (r) =>
    r.fulfill({ json: { user, next: "/orders", canSetCredentials: true } }),
  );
  let credentials: unknown;
  await page.route("**/api/auth/credentials", (r) => {
    credentials = r.request().postDataJSON();
    return r.fulfill({ json: { user, next: "/orders" } });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "إنشاء حساب جديد" }).click();
  await page.getByLabel("نوع الحساب المطلوب").selectOption("family");
  await page.getByLabel("رقم الجوال", { exact: true }).fill("0500000001");
  await page.getByRole("button", { name: "أرسل رمز التحقق" }).click();
  await page.getByLabel("اسم صاحب الحساب").fill("عميل الاختبار");
  await page.getByLabel("رمز التحقق", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "تحقق ومتابعة" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByLabel("كلمة المرور الجديدة", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "تعيين كلمة مرور اختياريًا", exact: true })
    .click();
  await page.getByLabel("اسم مستخدم اختياري").fill("family.user");
  await page
    .getByLabel("كلمة المرور الجديدة", { exact: true })
    .fill("new-password-123");
  await page.getByLabel("تأكيد كلمة المرور").fill("new-password-123");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "حفظ بيانات الدخول" }).click();
  await expect(page).toHaveURL(/\/register$/);
  expect(credentials).toEqual({
    username: "family.user",
    password: "new-password-123",
  });
});

for (const scenario of [
  { intent: "customer", role: "customer", destination: "orders", proof: true },
  { intent: "family", role: "customer", destination: "register", proof: true },
  { intent: "family", role: "producer", destination: "dashboard", proof: true },
  { intent: "customer", role: "admin", destination: "admin", proof: true },
  { intent: "customer", role: "customer", destination: "orders", proof: false },
])
  test(`OTP signup continues without mandatory credentials: ${scenario.intent}/${scenario.role}/${scenario.proof}`, async ({
    page,
  }) => {
    await page.route("**/api/session", (r) =>
      r.fulfill({ json: { user: null, registrationOpen: true } }),
    );
    await page.route("**/api/auth/request-otp", (r) =>
      r.fulfill({ json: { challengeId: "test-challenge" } }),
    );
    await page.route("**/api/auth/verify-otp", (r) =>
      r.fulfill({
        json: {
          user: { ...user, role: scenario.role },
          next: "/orders",
          canSetCredentials: scenario.proof,
        },
      }),
    );
    let credentialCalls = 0;
    await page.route("**/api/auth/credentials", (r) => {
      credentialCalls++;
      return r.fulfill({
        status: 400,
        json: { error: "Must not set credentials" },
      });
    });
    await page.goto("/login");
    await page
      .getByRole("button", { name: "إنشاء حساب جديد", exact: true })
      .click();
    await page.getByLabel("نوع الحساب المطلوب").selectOption(scenario.intent);
    await page.getByLabel("رقم الجوال", { exact: true }).fill("0500000001");
    await page
      .getByRole("button", { name: "أرسل رمز التحقق", exact: true })
      .click();
    await page.getByLabel("اسم صاحب الحساب").fill("عميل الاختبار");
    await page.getByLabel("رمز التحقق", { exact: true }).fill("1234");
    await page
      .getByRole("button", { name: "تحقق ومتابعة", exact: true })
      .click();
    await expect(
      page.getByLabel("كلمة المرور الجديدة", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("اسم مستخدم اختياري")).toHaveCount(0);
    if (!scenario.proof)
      await expect(
        page.getByRole("button", {
          name: "تعيين كلمة مرور اختياريًا",
          exact: true,
        }),
      ).toBeDisabled();
    await page
      .getByRole("button", { name: "متابعة التسجيل", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp("/" + scenario.destination + "$"));
    expect(credentialCalls).toBe(0);
  });
test("password recovery requires matching passwords and reports credential error", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: null, registrationOpen: true } }),
  );
  await page.route("**/api/auth/request-otp", (r) =>
    r.fulfill({ json: { challengeId: "test-challenge" } }),
  );
  await page.route("**/api/auth/verify-otp", (r) =>
    r.fulfill({
      json: {
        user: { ...user, role: "producer" },
        next: "/dashboard",
        canSetCredentials: true,
      },
    }),
  );
  let calls = 0;
  let success = false;
  await page.route("**/api/auth/credentials", (r) => {
    calls++;
    if (success)
      return r.fulfill({
        json: { user: { ...user, role: "producer" }, next: "/dashboard" },
      });
    return r.fulfill({ status: 409, json: { error: "اسم المستخدم مستخدم" } });
  });
  await page.goto("/login");
  await page
    .getByRole("button", { name: "تعيين أو استعادة كلمة المرور" })
    .click();
  await page.getByLabel("رقم الجوال", { exact: true }).fill("0500000001");
  await page.getByRole("button", { name: "أرسل رمز التحقق" }).click();
  await page.getByLabel("رمز التحقق", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "تحقق ومتابعة" }).click();
  await page
    .getByLabel("كلمة المرور الجديدة", { exact: true })
    .fill("new-password-123");
  await page.getByLabel("تأكيد كلمة المرور").fill("different-password");
  await page.getByRole("button", { name: "حفظ بيانات الدخول" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "كلمتا المرور غير متطابقتين",
  );
  expect(calls).toBe(0);
  await page.getByLabel("تأكيد كلمة المرور").fill("new-password-123");
  await page.getByRole("button", { name: "حفظ بيانات الدخول" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "اسم المستخدم مستخدم",
  );
  expect(calls).toBe(1);
  await expect(page).toHaveURL(/\/login$/);
  success = true;
  await page.getByRole("button", { name: "حفظ بيانات الدخول" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("public branding uses one login entry and the updated logo and name", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page).toHaveTitle("تسجيل الدخول | أكلات جدتنا");
  await expect(page.locator("header .header-actions a")).toHaveCount(1);
  await expect(page.locator("header .header-actions a")).toHaveText(
    "تسجيل الدخول",
  );
  await expect(page.locator("header .header-actions a")).toHaveAttribute(
    "href",
    "/login",
  );
  await expect(page.locator('.mobile-nav a[href="/login"]')).toHaveCount(1);
  await expect(page.locator('header a[href="/register"]')).toHaveCount(0);
  await expect(page.locator(".brand-logo")).toHaveAttribute(
    "src",
    /aklaat-jdatna-logo/,
  );
  await expect(
    page.getByRole("heading", { name: "الدخول إلى أكلات جدتنا" }),
  ).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain(
    "أكلات وغذاء الأجداد",
  );
});
test("account navigation recognizes customer and producer identity", async ({
  page,
}) => {
  let role = "customer";
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: { ...user, role }, registrationOpen: true } }),
  );
  await page.route("**/api/orders", (r) => r.fulfill({ json: { orders: [] } }));
  await page.route("**/api/producer/orders", (r) =>
    r.fulfill({ json: { orders: [] } }),
  );
  await page.goto("/orders");
  const nav = page.getByRole("navigation", { name: "حسابي", exact: true });
  await expect(
    nav.getByRole("link", { name: "طلباتي", exact: true }),
  ).toBeVisible();
  await expect(nav.locator('a[href="/dashboard/products"]')).toHaveCount(0);
  role = "producer";
  await page.goto("/dashboard/orders");
  await expect(nav.locator('a[href="/dashboard/products"]')).toBeVisible();
});
