import { test, expect } from "@playwright/test";
import { Pool } from "pg";

// رحلة الحساب في متصفح حقيقي بلا محاكاة للخادم: رقم إنشاء الحساب التجريبي برمز ثابت
// (وضع مراجعة المتاجر، فلا رسالة حقيقية)، والأرقام تُكتب عربية كما في كثير من الجوالات.
test.describe("real browser account journey", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database",
  );
  test.describe.configure({ mode: "serial" });
  const PHONE = "+966500000003";
  let pool: Pool;
  const reset = async () => {
    const ids = (
      await pool.query("SELECT id FROM jdatna.users WHERE phone=$1", [PHONE])
    ).rows.map((r) => r.id);
    await pool.query(
      "DELETE FROM jdatna.sessions WHERE user_id=ANY($1::uuid[])",
      [ids],
    );
    await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
      ids,
    ]);
    await pool.query("DELETE FROM jdatna.otp_challenges WHERE phone=$1", [
      PHONE,
    ]);
    await pool.query(
      "DELETE FROM jdatna.rate_limits WHERE key LIKE 'otp-%' OR key LIKE 'verify%' OR key LIKE 'password-login%'",
    );
  };
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
    ).toMatch(/^jdatna_test_/);
    await pool.query(
      `INSERT INTO jdatna.platform_settings(key,value) VALUES('store_review',jsonb_build_object('until',(now()+interval '1 day')::text))
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`,
    );
    await reset();
  });
  test.afterAll(async () => {
    await reset();
    await pool.query(
      "DELETE FROM jdatna.platform_settings WHERE key='store_review'",
    );
    await pool.end();
  });

  test("signup with Arabic digits, stays signed in, signs in again, recovers the password", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    // 1) إنشاء حساب: الجوال والرمز وكلمة المرور بأرقام عربية.
    await page.goto("/login");
    await page.getByRole("button", { name: "إنشاء حساب جديد" }).click();
    await page.getByLabel("رقم الجوال").fill("٠٥٠٠٠٠٠٠٠٣");
    await page.getByRole("button", { name: "أرسل رمز التحقق" }).click();
    await page.getByLabel("اسم صاحب الحساب").fill("عميل الرحلة");
    await page.getByLabel("رمز التحقق").fill("١٢٣٤");
    await expect(
      page.getByRole("button", { name: /إعادة إرسال الرمز بعد \d+ ثانية/ }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "تحقق ومتابعة" }).click();
    await page.getByLabel("كلمة المرور الجديدة", { exact: true }).fill("٤٨٢٦");
    await page.locator('input[name="confirmPassword"]').fill("٤٨٢٦");
    await page.getByRole("button", { name: "حفظ بيانات الدخول" }).click();
    await expect(page).toHaveURL(/\/orders$/);

    // 2) يبقى الدخول بعد إعادة التحميل، وفي صفحة جديدة، ولا تُطلب البيانات مرة أخرى.
    const cookie = (await context.cookies()).find(
      (c) => c.name === "jdatna_session",
    );
    expect(cookie && cookie.expires - Date.now() / 1000).toBeGreaterThan(
      360 * 86400,
    );
    await page.reload();
    await expect(page.locator("header .header-actions")).toContainText("حسابي");
    const again = await context.newPage();
    await again.goto("/login");
    await expect(again.getByText("أنت مسجل الدخول بالفعل.")).toBeVisible();
    await again.close();

    // (الرقم التجريبي يحرر حسابه السابق عند تسجيل جديد بتصميم وضع المراجعة؛
    // «الجوال مسجل» لرقم عادي مُختبر في tests/auth-journey.test.ts.)
    await context.clearCookies();
    await page.goto("/login");
    // 3) الدخول بكلمة المرور: الجوال وكلمة المرور بأرقام عربية.
    await page.getByLabel("اسم المستخدم أو رقم الجوال").fill("٠٥٠٠٠٠٠٠٠٣");
    await page.getByLabel("كلمة المرور", { exact: true }).fill("٤٨٢٦");
    await page.getByRole("button", { name: "دخول", exact: true }).click();
    await expect(page).toHaveURL(/\/orders$/);

    // 4) نسيت كلمة المرور: رمز الجوال ثم كلمة جديدة، والقديمة لا تعمل بعدها.
    await context.clearCookies();
    await pool.query("DELETE FROM jdatna.rate_limits WHERE key LIKE 'otp-%'");
    await page.goto("/login");
    await page.getByRole("button", { name: "نسيت كلمة المرور" }).click();
    await page.getByLabel("رقم الجوال").fill("0500000003");
    await page.getByRole("button", { name: "أرسل رمز التحقق" }).click();
    await page.getByLabel("رمز التحقق").fill("1234");
    await page.getByRole("button", { name: "تحقق ومتابعة" }).click();
    await page.getByLabel("كلمة المرور الجديدة", { exact: true }).fill("7391");
    await page.locator('input[name="confirmPassword"]').fill("7391");
    await page.getByRole("button", { name: "حفظ بيانات الدخول" }).click();
    await expect(page).toHaveURL(/\/orders$/);
    await context.clearCookies();
    await page.goto("/login");
    await page.getByLabel("اسم المستخدم أو رقم الجوال").fill("0500000003");
    await page.getByLabel("كلمة المرور", { exact: true }).fill("4826");
    await page.getByRole("button", { name: "دخول", exact: true }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "غير صحيحة",
    );
  });
});
