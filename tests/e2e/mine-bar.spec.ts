import { test, expect } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";

/**
 * فلاتر العضو أعلى الرئيسية والتصفح والعروض (قرار المالك 2026-11-22):
 * الأسرة ترى «مشابه لمنتجاتي» و«منطقتي»، والافتراضي «الكل»، وكل مفتاح يعمل وحده ويجتمع مع الآخر.
 * الزائر بلا حساب لا يرى المفاتيح.
 */
test.describe("member filters at the top of the page", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database",
  );
  test.describe.configure({ mode: "serial" });
  let pool: Pool | undefined;
  const user = randomUUID();
  const family = randomUUID();
  const product = randomUUID();
  const token = randomBytes(32).toString("hex");
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (await pool.query("SELECT current_database() AS name")).rows[0].name,
    ).toMatch(/^jdatna_test_/);
    const phone =
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const city = (
      await pool.query("SELECT id FROM jdatna.cities ORDER BY id LIMIT 1")
    ).rows[0].id;
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'أسرة المفاتيح',$2,'producer',now())",
      [user, phone],
    );
    await pool.query(
      "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة المفاتيح',$4,$5,'approved')",
      [family, user, "mine-bar-" + family, city, phone],
    );
    await pool.query(
      "INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status) VALUES($1,$2,'طبق المفاتيح','وصف',20,'صحن','available')",
      [product, family],
    );
    // جلسة الموقع: البصمة تُحسب في القاعدة نفسها.
    await pool.query(
      "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES(encode(sha256(convert_to($1,'UTF8')),'hex'),$2,now()+interval '1 hour')",
      [token, user],
    );
  });
  test.afterAll(async () => {
    await pool?.query("DELETE FROM jdatna.sessions WHERE user_id=$1", [user]);
    await pool?.query("DELETE FROM jdatna.products WHERE id=$1", [product]);
    await pool?.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
      family,
    ]);
    await pool?.query("DELETE FROM jdatna.users WHERE id=$1", [user]);
    await pool?.end();
  });

  test("a visitor sees no member filters", async ({ page }) => {
    await page.goto("/browse");
    await expect(page.getByRole("navigation", { name: "اعرض لي" })).toHaveCount(
      0,
    );
  });

  test("a family toggles «منطقتي» and «مشابه لمنتجاتي»; the default is everything", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: "jdatna_session", value: token, url: baseURL! },
    ]);
    // ترحيب الأسرة الجديدة يظهر مرة في الزيارة؛ ليس موضوع هذا الاختبار.
    await context.addInitScript(() =>
      sessionStorage.setItem("jdatna:family-welcome", "1"),
    );
    for (const path of ["/", "/offers"]) {
      await page.goto(path);
      const bar = page.getByRole("navigation", { name: "اعرض لي" });
      // بلا «الكل»: لا اختيار = الكل.
      await expect(bar.getByRole("link", { name: "الكل" })).toHaveCount(0);
      await expect(
        bar.getByRole("checkbox", { name: "منطقتي" }),
      ).not.toBeChecked();
    }
    await page.goto("/browse");
    const bar = page.getByRole("navigation", { name: "اعرض لي" });
    await expect(bar.getByRole("status")).toHaveText(
      "يُعرض الآن الكل، بلا فلتر. اختر ما يناسبك من الخيارات.",
    );
    await expect(bar.getByRole("checkbox")).toHaveText([
      "مشابه لمنتجاتي",
      "منطقتي",
    ]);
    await bar.getByRole("checkbox", { name: "منطقتي" }).click();
    await expect(page).toHaveURL(/mine=area/);
    await expect(bar.getByRole("checkbox", { name: "منطقتي" })).toBeChecked();
    // سطر الحالة يقول ما يُعرض الآن بالاسم.
    await expect(bar.getByRole("status")).toHaveText(
      /^يُعرض الآن كل ما في .+\.$/,
    );
    await bar.getByRole("checkbox", { name: "مشابه لمنتجاتي" }).click();
    await expect(page).toHaveURL(/mine=area%2Csimilar|mine=area,similar/);
    // بلا أقسام لمنتجاتها: سبب ظاهر بدل قائمة فارغة بلا تفسير.
    await expect(bar.getByRole("status")).toContainText("أضف منتجاتك");
    // المفتاح يوقف نفسه، وإلغاء الاثنين يرجع الكل.
    await bar.getByRole("checkbox", { name: "منطقتي" }).click();
    await expect(page).toHaveURL(/mine=similar/);
    await bar.getByRole("checkbox", { name: "مشابه لمنتجاتي" }).click();
    await expect(page).not.toHaveURL(/mine=/);
    await expect(bar.getByRole("checkbox", { checked: true })).toHaveCount(0);
    // لا شيء أعرض من الشاشة.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
});
