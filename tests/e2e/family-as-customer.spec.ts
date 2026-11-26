import { expect, test } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";

/**
 * قرار المالك 2026-11-26:
 * - العميل يحوّل حسابه إلى أسرة منتجة من «معلوماتي».
 * - الأسرة تتعامل مع الأسر الأخرى كأي عميل: «اطلب من الأسر» والعروض والمندوبون في قائمتها،
 *   وطلبها لا يظهر في لوحة طلبات العملاء عندها.
 * قاعدة اختبار معزولة فقط.
 */
test.describe("a family buys from other families like a customer", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database",
  );
  test.describe.configure({ mode: "serial" });
  let pool: Pool | undefined;
  const customer = randomUUID();
  const familyUser = randomUUID();
  const family = randomUUID();
  const tc = randomBytes(32).toString("hex");
  const tf = randomBytes(32).toString("hex");
  const body = `أبي شاهي وكليجا ${family.slice(0, 6)}`;
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (await pool.query("SELECT current_database() AS name")).rows[0].name,
    ).toMatch(/^jdatna_test_/);
    const ph = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const city = (
      await pool.query("SELECT id FROM jdatna.cities ORDER BY id LIMIT 1")
    ).rows[0].id;
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'عميل يتحول',$2,'customer',now()),($3,'أسرة الشاهي',$4,'producer',now())",
      [customer, ph(), familyUser, ph()],
    );
    await pool.query(
      "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'شاهي أم فهد',$4,$5,'approved')",
      [family, familyUser, "e2e-tea-" + family, city, ph()],
    );
    for (const [t, u] of [
      [tc, customer],
      [tf, familyUser],
    ])
      await pool.query(
        "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES(encode(sha256(convert_to($1,'UTF8')),'hex'),$2,now()+interval '1 hour')",
        [t, u],
      );
  });
  test.afterAll(async () => {
    const both = [customer, familyUser];
    await pool?.query(
      "DELETE FROM jdatna.customer_requests WHERE user_id=ANY($1::uuid[])",
      [both],
    );
    await pool?.query(
      "DELETE FROM jdatna.sessions WHERE user_id=ANY($1::uuid[])",
      [both],
    );
    await pool?.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
      family,
    ]);
    await pool?.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
      both,
    ]);
    await pool?.end();
  });
  const as = async (
    context: import("@playwright/test").BrowserContext,
    token: string,
    baseURL: string | undefined,
  ) => {
    await context.addCookies([
      { name: "jdatna_session", value: token, url: baseURL },
    ]);
    await context.addInitScript(() => {
      sessionStorage.setItem("jdatna:push-later", "1");
      sessionStorage.setItem("jdatna:family-welcome", "1");
    });
  };

  test("a customer sees how to turn the account into a family", async ({
    page,
    context,
    baseURL,
  }) => {
    await as(context, tc, baseURL);
    await page.goto("/me");
    const card = page.getByRole("region", {
      name: "حوّل حسابك إلى أسرة منتجة",
    });
    await expect(card).toBeVisible();
    // عميل بلا ملف أسرة: الزر يفتح تسجيل الأسرة.
    await card.getByRole("button", { name: "سجّل أسرتك" }).click();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("a family asks other families from «اطلب من الأسر», and its request is not on its own board", async ({
    page,
    context,
    baseURL,
  }, info) => {
    // المشروعان يكتبان في الحساب نفسه؛ يكفي واحد.
    test.skip(info.project.name !== "desktop", "Desktop only");
    await as(context, tf, baseURL);
    await page.goto("/me");
    // قائمة الأسرة فيها ما يحتاجه العميل.
    const menu = page.getByRole("navigation", { name: "حسابي", exact: true });
    await menu.getByText("قائمة حسابي").click();
    for (const name of ["اطلب من الأسر", "العروض الخاصة", "المندوبين"])
      await expect(menu.getByRole("link", { name })).toBeVisible();
    await menu.getByRole("link", { name: "اطلب من الأسر" }).click();
    await expect(page).toHaveURL(/\/requests#ask$/);
    await expect(
      page.getByRole("tab", { name: "اطلب من الأسر", selected: true }),
    ).toBeVisible();
    // ينشر طلبه كأي عميل.
    await page.getByLabel("وش تطلب؟").fill(body);
    await page
      .getByRole("combobox", { name: /^المدينة/ })
      .selectOption({ index: 1 });
    await page
      .getByRole("button", { name: /انشر|نشر/ })
      .first()
      .click();
    await expect
      .poll(async () =>
        Number(
          (
            await pool!.query(
              "SELECT count(*)::int AS n FROM jdatna.customer_requests WHERE user_id=$1 AND body=$2",
              [familyUser, body],
            )
          ).rows[0].n,
        ),
      )
      .toBe(1);
    // لوحة «طلبات العملاء» عندها لا تعرض طلبها هي.
    await page.getByRole("tab", { name: "طلبات العملاء" }).click();
    await expect(
      page.getByRole("tab", { name: "طلبات العملاء", selected: true }),
    ).toBeVisible();
    await expect(page.getByText(body)).toHaveCount(0);
  });

  test("a family sees «turn my account into a customer» with a confirmation", async ({
    page,
    context,
    baseURL,
  }) => {
    await as(context, tf, baseURL);
    await page.goto("/me");
    const card = page.getByRole("region", { name: "حوّل حسابك إلى عميل" });
    await expect(card).toBeVisible();
    await expect(
      page.getByRole("region", { name: "حوّل حسابك إلى أسرة منتجة" }),
    ).toHaveCount(0);
    await card.getByRole("button", { name: "تحويل حسابي إلى عميل" }).click();
    // تأكيد بالكتابة (قرار المالك 2026-11-26): لا يعمل الزر حتى يكتب «عميل».
    // لا نحوّل هنا فعلًا: الحساب مشترك بين الاختبارات.
    const confirm = card.getByRole("button", {
      name: "تأكيد التحويل إلى عميل",
    });
    await expect(confirm).toBeDisabled();
    const word = card.getByLabel("للتأكيد اكتب «عميل»");
    await word.fill("عمي");
    await expect(confirm).toBeDisabled();
    await word.fill(" عَميل ");
    await expect(confirm).toBeEnabled();
    await page.screenshot({ path: "test-results/typed-confirm.png" });
    await card.getByRole("button", { name: "تراجع" }).click();
    await expect(
      card.getByRole("button", { name: "تحويل حسابي إلى عميل" }),
    ).toBeVisible();
  });
});
