import { test, expect } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";

/**
 * «ادعُ صديقًا»: الرابط في «معلوماتي» مع الرصيد، ورابط الدعوة يفتح «حساب جديد» ويذكر أن صديقًا دعاه،
 * ويطلب رقم من دعاه (اختياري). وصفحة الإدارة تعرض الأرصدة، والضغط على الاسم يعرض من سجلوا.
 */
test.describe("invite a friend", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database",
  );
  test.describe.configure({ mode: "serial" });
  let pool: Pool | undefined;
  const host = randomUUID();
  const friend = randomUUID();
  const token = randomBytes(32).toString("hex");
  let code = "";
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (await pool.query("SELECT current_database() AS name")).rows[0].name,
    ).toMatch(/^jdatna_test_/);
    const ph = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'صاحب الدعوة',$2,'customer',now()),($3,'الصديق',$4,'customer',now())",
      [host, ph(), friend, ph()],
    );
    await pool.query(
      "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES(encode(sha256(convert_to($1,'UTF8')),'hex'),$2,now()+interval '1 hour')",
      [token, host],
    );
  });
  test.afterAll(async () => {
    await pool?.query("DELETE FROM jdatna.referrals WHERE referrer_id=$1", [
      host,
    ]);
    await pool?.query("DELETE FROM jdatna.referral_codes WHERE user_id=$1", [
      host,
    ]);
    await pool?.query("DELETE FROM jdatna.sessions WHERE user_id=$1", [host]);
    await pool?.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
      [host, friend],
    ]);
    await pool?.end();
  });

  test("the profile shows the invite link and the balance", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: "jdatna_session", value: token, url: baseURL! },
    ]);
    await context.addInitScript(() =>
      sessionStorage.setItem("jdatna:push-later", "1"),
    );
    await page.goto("/me#invite");
    const box = page.getByRole("region", { name: "ادعُ صديقًا" });
    await expect(box.getByTestId("invite-balance")).toContainText("رصيدك: 0");
    const link = await box.getByLabel("رابط دعوتك").inputValue();
    expect(link).toMatch(/^https:\/\/jdtna\.sa\/r\/[2-9a-km-zA-HJ-NP-Z]{7}$/);
    code = link.split("/r/")[1];
    // صديق سجل عن طريقه: يزيد الرصيد.
    await pool!.query(
      "INSERT INTO jdatna.referrals(referred_id,referrer_id,via) VALUES($1,$2,'link')",
      [friend, host],
    );
    await page.reload();
    await expect(
      page
        .getByRole("region", { name: "ادعُ صديقًا" })
        .getByTestId("invite-balance"),
    ).toContainText("رصيدك: 1");
  });

  test("the invite link opens sign-up and remembers who invited", async ({
    page,
    context,
  }) => {
    test.skip(!code, "needs the code from the previous test");
    await page.goto(`/r/${code}`);
    await expect(page).toHaveURL(/\/login\?signup=1/);
    const saved = (await context.cookies()).find(
      (c) => c.name === "jdatna_ref",
    );
    expect(saved?.value).toBe(code);
    // رمز غير صحيح لا يُحفظ، ويفتح الرئيسية.
    await page.goto("/r/zzzzzzz");
    await expect(page).toHaveURL(/\/$/);
  });
});
