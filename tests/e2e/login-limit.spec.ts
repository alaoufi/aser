import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { hashPassword } from "../../src/server/credentials";

/**
 * لا قفل للحساب (قرار المالك 2026-11-25): بعد 5 محاولات خاطئة تظهر «تجاوزت الحد المسموح من
 * محاولات الدخول» وزر «لاستعادة كلمة المرور اضغط هنا» الذي يرسل رمز التحقق إلى الجوال المكتوب.
 * قاعدة اختبار معزولة فقط؛ إرسال الرمز نفسه مُعترَض في المتصفح (لا رسائل حقيقية).
 */
test.describe("login attempt limit", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database environment",
  );
  let pool: Pool;
  const id = randomUUID();
  const phone =
    "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  const local = "0" + phone.slice(4);
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
    ).toMatch(/^jdatna_test_/);
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at,password_hash) VALUES($1,'حد الدخول',$2,'customer',now(),$3) ON CONFLICT (id) DO NOTHING",
      [id, phone, await hashPassword("2468")],
    );
  });
  test.beforeEach(async () => {
    await pool.query(
      "DELETE FROM jdatna.rate_limits WHERE key LIKE 'password-%'",
    );
  });
  test.afterAll(async () => {
    await pool.query(
      "DELETE FROM jdatna.rate_limits WHERE key LIKE 'password-%'",
    );
    await pool.query("DELETE FROM jdatna.sessions WHERE user_id=$1", [id]);
    await pool.query("DELETE FROM jdatna.users WHERE id=$1", [id]);
    await pool.end();
  });

  test("five wrong passwords show the limit message and a button that sends the code", async ({
    page,
  }) => {
    const challengeId = randomUUID();
    let sent: { phone?: string; purpose?: string } = {};
    await page.route("**/api/auth/request-otp", async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { challengeId } });
    });
    await page.goto("/login");
    const identifier = page.getByLabel("اسم المستخدم أو رقم الجوال");
    for (let i = 0; i < 5; i++) {
      await identifier.fill(local);
      await page.getByLabel("كلمة المرور", { exact: true }).fill("1111");
      await page.getByRole("button", { name: "دخول", exact: true }).click();
      await expect(
        page.locator("form").getByRole("button", { name: "دخول", exact: true }),
      ).toBeEnabled();
      await expect(page.getByText(/غير صحيحة|تجاوزت الحد/)).toBeVisible();
    }
    await expect(
      page.getByText("تجاوزت الحد المسموح من محاولات الدخول"),
    ).toBeVisible();
    const recover = page.getByRole("button", {
      name: "لاستعادة كلمة المرور اضغط هنا",
    });
    await expect(recover).toBeVisible();
    await page.screenshot({ path: "test-results/login-limit.png" });
    await recover.click();
    // يُرسل الرمز مباشرة إلى الجوال المكتوب، وتظهر خانة الرمز.
    await expect(page.getByLabel("رمز التحقق")).toBeVisible();
    expect(sent).toEqual({ phone: local, purpose: "reset" });
    await expect(
      page.getByRole("heading", { name: "نسيت كلمة المرور" }),
    ).toBeVisible();
    // الحساب ليس مقفلًا: لم يُكتب قفل في قاعدة البيانات.
    expect(
      (
        await pool.query(
          "SELECT login_locked_at FROM jdatna.users WHERE id=$1",
          [id],
        )
      ).rows[0].login_locked_at,
    ).toBeNull();
  });
});
