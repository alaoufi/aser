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
  let otpCalls = 0;
  await page.route("**/api/auth/*-otp", (r) => {
    otpCalls++;
    return r.fulfill({
      status: 400,
      json: { error: "OTP is not used for password login" },
    });
  });
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
  expect(otpCalls).toBe(0);
});
test("family signup requires credentials before application", async ({
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
  ).toBeVisible();
  await page.getByLabel("اسم مستخدم اختياري").fill("family.user");
  await page
    .getByLabel("كلمة المرور الجديدة", { exact: true })
    .fill("1234");
  await page.getByLabel("تأكيد كلمة المرور").fill("1234");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "حفظ بيانات الدخول" }).click();
  await expect(page).toHaveURL(/\/register$/);
  expect(credentials).toEqual({
    username: "family.user",
    password: "1234",
  });
});

for (const scenario of [
  { intent: "customer", role: "customer", destination: "orders" },
  { intent: "family", role: "customer", destination: "register" },
  { intent: "family", role: "producer", destination: "dashboard" },
  { intent: "customer", role: "admin", destination: "admin" },
])
  test(`OTP signup requires password then routes ${scenario.intent}/${scenario.role}`, async ({
    page,
  }) => {
    await page.route("**/api/session", (r) =>
      r.fulfill({ json: { user: null, registrationOpen: true } }),
    );
    let requestPayload: unknown, verifyPayload: unknown;
    await page.route("**/api/auth/request-otp", (r) => {
      requestPayload = r.request().postDataJSON();
      return r.fulfill({ json: { challengeId: "test-challenge" } });
    });
    await page.route("**/api/auth/verify-otp", (r) => {
      verifyPayload = r.request().postDataJSON();
      return r.fulfill({
        json: {
          user: { ...user, role: scenario.role },
          next: "/orders",
          canSetCredentials: true,
        },
      });
    });
    let credentialCalls = 0;
    await page.route("**/api/auth/credentials", (r) => {
      credentialCalls++;
      return r.fulfill({
        json: { user: { ...user, role: scenario.role }, next: "/orders" },
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
    expect(requestPayload).toEqual({ phone: "0500000001", purpose: "signup" });
    expect(verifyPayload).toEqual({
      challengeId: "test-challenge",
      code: "1234",
      name: "عميل الاختبار",
      purpose: "signup",
    });
    await expect(
      page.getByLabel("كلمة المرور الجديدة", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "متابعة التسجيل", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "حفظ بيانات الدخول", exact: true })
      .click();
    expect(credentialCalls).toBe(0);
    await expect(page).toHaveURL(/\/login$/);
    await page
      .getByLabel("كلمة المرور الجديدة", { exact: true })
      .fill("new-password-123");
    await page
      .getByLabel("تأكيد كلمة المرور", { exact: true })
      .fill("new-password-123");
    await page
      .getByRole("button", { name: "حفظ بيانات الدخول", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp("/" + scenario.destination + "$"));
    expect(credentialCalls).toBe(1);
  });

test("password recovery requires matching passwords and reports credential error", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: null, registrationOpen: true } }),
  );
  let resetRequest: unknown, resetVerify: unknown;
  await page.route("**/api/auth/request-otp", (r) => {
    resetRequest = r.request().postDataJSON();
    return r.fulfill({ json: { challengeId: "test-challenge" } });
  });
  await page.route("**/api/auth/verify-otp", (r) => {
    resetVerify = r.request().postDataJSON();
    return r.fulfill({
      json: {
        user: { ...user, role: "producer" },
        next: "/dashboard",
        canSetCredentials: true,
      },
    });
  });
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
  await page.getByRole("button", { name: "نسيت كلمة المرور" }).click();
  await page.getByLabel("رقم الجوال", { exact: true }).fill("0500000001");
  await page.getByRole("button", { name: "أرسل رمز التحقق" }).click();
  await page.getByLabel("رمز التحقق", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "تحقق ومتابعة" }).click();
  expect(resetRequest).toEqual({ phone: "0500000001", purpose: "reset" });
  expect(resetVerify).toEqual({
    challengeId: "test-challenge",
    code: "1234",
    purpose: "reset",
  });
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
    /jdatna-symbol/,
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

for (const [role, destination] of [["customer", "/orders"], ["producer", "/dashboard"], ["admin", "/admin"]]) {
  test(`existing ${role} session keeps account entry after reload without signup`, async ({ page }) => {
    let active = true;
    await page.route("**/api/session", r => r.fulfill({ json: { user: active ? { ...user, role } : null, registrationOpen: true } }));
    await page.route("**/api/auth/**", () => { throw Error("Existing session must not request signup or OTP"); });
    await page.goto("/login");
    await expect(page.getByText("أنت مسجل الدخول بالفعل.")).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "متابعة إلى حسابي" })).toHaveAttribute("href", destination);
    await page.reload();
    await expect(page.getByText("أنت مسجل الدخول بالفعل.")).toBeVisible();
    await expect(page.locator("header .header-actions a")).toHaveText("حسابي");
    await expect(page.locator("header .header-actions a")).toHaveAttribute("href", destination);
    await expect(page.locator(".mobile-nav").getByRole("link", { name: "حسابي", includeHidden: true })).toHaveAttribute("href", destination);
    active = false;
    await page.reload();
    await expect(page.getByRole("heading", { name: "الدخول إلى أكلات جدتنا" })).toBeVisible();
  });
}
