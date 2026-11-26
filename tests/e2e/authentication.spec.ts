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
/**
 * التسجيل (قرار المالك 2026-11-26): الجوال وكلمة المرور (أربع خانات على الأقل) ثم رمز التحقق،
 * ثم «تم التسجيل» و«إتمام التسجيل» أو «لاحقًا». «لاحقًا» يبقى عميلًا، والإتمام: أسرة منتجة أو عميل.
 */
async function signupUntilDone(
  page: import("@playwright/test").Page,
  calls: { request?: unknown; verify?: unknown; credentials?: unknown },
  path = "/login",
) {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: null, registrationOpen: true } }),
  );
  await page.route("**/api/auth/request-otp", (r) => {
    calls.request = r.request().postDataJSON();
    return r.fulfill({ json: { challengeId: "test-challenge" } });
  });
  await page.route("**/api/auth/verify-otp", (r) => {
    calls.verify = r.request().postDataJSON();
    return r.fulfill({
      json: { user, next: "/orders", canSetCredentials: true },
    });
  });
  await page.route("**/api/auth/credentials", (r) => {
    calls.credentials = r.request().postDataJSON();
    return r.fulfill({ json: { user, next: "/orders" } });
  });
  await page.goto(path);
  await page
    .getByRole("button", { name: "إنشاء حساب جديد", exact: true })
    .click();
  // لا نوع حساب ولا اسم في البداية.
  await expect(page.getByLabel("نوع الحساب المطلوب")).toHaveCount(0);
  await expect(page.getByLabel("اسم صاحب الحساب")).toHaveCount(0);
  await page.getByLabel("رقم الجوال", { exact: true }).fill("0500000001");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("ab1");
  await page.getByLabel("تأكيد كلمة المرور").fill("ab1");
  await page.getByRole("button", { name: "أرسل رمز التحقق" }).click();
  // أقل من أربع خانات يمنعه المتصفح قبل الإرسال.
  expect(
    await page
      .getByLabel("كلمة المرور", { exact: true })
      .evaluate((el) => (el as HTMLInputElement).validity.tooShort),
  ).toBe(true);
  expect(calls.request).toBeUndefined();
  await page.getByLabel("كلمة المرور", { exact: true }).fill("ab12");
  await page.getByLabel("تأكيد كلمة المرور").fill("ab13");
  await page.getByRole("button", { name: "أرسل رمز التحقق" }).click();
  await expect(page.getByText("كلمتا المرور غير متطابقتين")).toBeVisible();
  // أي أحرف ورموز، أربع خانات فأكثر.
  await page.getByLabel("كلمة المرور", { exact: true }).fill("ab#1");
  await page.getByLabel("تأكيد كلمة المرور").fill("ab#1");
  await page.getByRole("button", { name: "أرسل رمز التحقق" }).click();
  expect(calls.request).toEqual({ phone: "0500000001", purpose: "signup" });
  await page.getByLabel("رمز التحقق", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "تحقق ومتابعة" }).click();
  const done = page.getByRole("region", { name: "تم التسجيل ✓" });
  await expect(done).toBeVisible();
  expect(calls.verify).toEqual({
    challengeId: "test-challenge",
    code: "123456",
    purpose: "signup",
  });
  // كلمة المرور من الخطوة الأولى تُحفظ مباشرة.
  expect(calls.credentials).toEqual({ password: "ab#1" });
  return done;
}

test("signup is phone and password, then «later» keeps a customer account", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const calls = {};
  const done = await signupUntilDone(page, calls);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/signup-done.png" });
  await done.getByRole("button", { name: "لاحقًا" }).click();
  await expect(page).toHaveURL(/\/$/);
});

for (const [choice, destination] of [
  ["أسرة منتجة", "register"],
  ["عميل", "me"],
] as const)
  test(`completing signup as «${choice}» opens /${destination}`, async ({
    page,
  }) => {
    const done = await signupUntilDone(page, {});
    await done.getByRole("button", { name: "إتمام التسجيل" }).click();
    await page.screenshot({ path: "test-results/signup-choose.png" });
    await done.getByRole("button", { name: choice, exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/" + destination + "$"));
  });

test("a family signup link goes straight to the family form after signup", async ({
  page,
}) => {
  const done = await signupUntilDone(page, {}, "/login?intent=family");
  await done.getByRole("button", { name: "إتمام التسجيل" }).click();
  await expect(page).toHaveURL(/\/register$/);
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
  await expect(
    page.locator("header .header-actions a:not(.messages-link)"),
  ).toHaveCount(1);
  await expect(
    page.locator("header .header-actions a:not(.messages-link)"),
  ).toHaveText("تسجيل الدخول");
  await expect(
    page.locator("header .header-actions a:not(.messages-link)"),
  ).toHaveAttribute("href", "/login");
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
  await nav.getByText("قائمة حسابي").click();
  await expect(
    nav.getByRole("link", { name: "طلباتي", exact: true }),
  ).toBeVisible();
  await expect(nav.locator('a[href="/dashboard"]')).toHaveCount(0);
  role = "producer";
  // القائمة سطر واحد: «لوحتي» للأسرة، وأقسامها مربعات داخل اللوحة.
  await page.goto("/dashboard/orders");
  await expect(
    nav.getByRole("link", { name: "لوحتي", includeHidden: true }),
  ).toHaveAttribute("href", "/dashboard");
  await expect(nav.locator('a[href="/dashboard/products"]')).toHaveCount(0);
});

for (const [role, destination] of [
  ["customer", "/orders"],
  ["producer", "/dashboard"],
  // صاحب الصلاحيات الإدارية: في الموقع حسابه الشخصي (عميل) ويرى «لوحة الإدارة» فقط.
  ["admin", "/orders"],
]) {
  test(`existing ${role} session keeps account entry after reload without signup`, async ({
    page,
  }) => {
    let active = true;
    await page.route("**/api/session", (r) =>
      r.fulfill({
        json: {
          user: active
            ? role === "admin"
              ? {
                  ...user,
                  role: "customer",
                  permissions: [],
                  adminAccess: true,
                }
              : { ...user, role }
            : null,
          registrationOpen: true,
        },
      }),
    );
    await page.route("**/api/auth/**", () => {
      throw Error("Existing session must not request signup or OTP");
    });
    await page.goto("/login");
    await expect(page.getByText("أنت مسجل الدخول بالفعل.")).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "متابعة إلى حسابي" }),
    ).toHaveAttribute("href", destination);
    await page.reload();
    await expect(page.getByText("أنت مسجل الدخول بالفعل.")).toBeVisible();
    const links = page.locator("header .header-actions a:not(.messages-link)");
    if (role === "admin") {
      // حسابه الشخصي (طلباته ومعلوماته)، و«لوحة الإدارة» زر يفتحها بجلسة مستقلة.
      await expect(links).toHaveText("حسابي");
      await expect(links).toHaveAttribute("href", "/orders");
      await expect(
        page.locator("header .header-actions").getByTestId("open-admin-panel"),
      ).toHaveText("لوحة الإدارة");
      await expect(
        page.locator(".mobile-nav").getByTestId("open-admin-panel"),
      ).toBeAttached();
    } else {
      await expect(links).toHaveText("حسابي");
      await expect(links).toHaveAttribute("href", destination);
      await expect(
        page
          .locator(".mobile-nav")
          .getByRole("link", { name: "حسابي", includeHidden: true }),
      ).toHaveAttribute("href", destination);
    }
    active = false;
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "الدخول إلى أكلات جدتنا" }),
    ).toBeVisible();
  });
}
