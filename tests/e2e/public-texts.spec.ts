import { expect, test } from "@playwright/test";
import { Pool } from "pg";

/**
 * قاعدة المالك (2026-11-26): كل جملة في الصفحات العامة من «نصوص الموقع»، فتعديلها من الإدارة
 * يظهر في الصفحة دون برمجة. «أسر منتجة تغطي منطقتك» وغيرها صارت مفاتيح p.home.*.
 * يُعدَّل هنا عنوان الرئيسية (p.home.t1) لأن اختبارًا آخر لا يعتمد عليه، فلا يتسابق اختباران.
 * قاعدة اختبار معزولة فقط.
 */
test.describe("public pages read their wording from the site texts", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database environment",
  );
  let pool: Pool;
  const key = "text:p.home.t1";
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
    ).toMatch(/^jdatna_test_/);
  });
  test.afterAll(async () => {
    await pool.end();
  });

  test("the home heading follows the edited text", async ({ page }, info) => {
    // المفتاح مشترك بين المشروعين، فيكفي مشروع واحد كي لا يتسابقا عليه.
    test.skip(info.project.name !== "desktop", "Desktop only");
    try {
      await page.goto("/");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "أكلات جدتنا وأصالة الماضي",
        }),
      ).toBeAttached();
      await expect(
        page.getByRole("heading", { name: "أسر منتجة تغطي منطقتك" }),
      ).toBeVisible();

      await pool.query(
        "INSERT INTO jdatna.site_settings(key,value) VALUES($1,'عنوان معدّل للاختبار') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value",
        [key],
      );
      await page.reload();
      await expect(
        page.getByRole("heading", { level: 1, name: "عنوان معدّل للاختبار" }),
      ).toBeAttached();
    } finally {
      await pool.query("DELETE FROM jdatna.site_settings WHERE key=$1", [key]);
    }
  });
});
