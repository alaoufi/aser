import { test, expect } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";

/**
 * القائمة السفلية و«دليلي» و«طلبات العملاء» (قرار المالك 2026-11-22):
 * - العميل: (+) «اطلب» ينشر طلبًا، ولا يظهر اسمه للأسرة إلا بموافقته؛ ويحفظ الأسرة في «دليلي».
 * - الأسرة: (+) «إضافة منتج»، وترى طلبات العملاء وتراسل صاحب الطلب.
 */
test.describe("bottom bar, my directory and customer requests", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database",
  );
  test.describe.configure({ mode: "serial" });
  let pool: Pool | undefined;
  const customer = randomUUID();
  const familyUser = randomUUID();
  const family = randomUUID();
  const slug = "e2e-dir-" + family;
  const tc = randomBytes(32).toString("hex");
  const tf = randomBytes(32).toString("hex");
  const body = `قرصان لخمسة ${family.slice(0, 6)}`;
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (await pool.query("SELECT current_database() AS name")).rows[0].name,
    ).toMatch(/^jdatna_test_/);
    const ph = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const city = (
      await pool.query(
        "SELECT id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' ORDER BY id LIMIT 1",
      )
    ).rows[0].id;
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'عميلة الدليل',$2,'customer',now()),($3,'أسرة الدليل',$4,'producer',now())",
      [customer, ph(), familyUser, ph()],
    );
    await pool.query(
      "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'مطبخ الدليل',$4,$5,'approved')",
      [family, familyUser, slug, city, ph()],
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
      "DELETE FROM jdatna.messages WHERE conversation_id IN (SELECT id FROM jdatna.conversations WHERE producer_id=$1)",
      [family],
    );
    await pool?.query("DELETE FROM jdatna.conversations WHERE producer_id=$1", [
      family,
    ]);
    await pool?.query(
      "DELETE FROM jdatna.customer_requests WHERE user_id=ANY($1::uuid[])",
      [both],
    );
    await pool?.query(
      "DELETE FROM jdatna.directory_entries WHERE owner_id=ANY($1::uuid[])",
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
    baseURL: string,
  ) => {
    await context.addCookies([
      { name: "jdatna_session", value: token, url: baseURL },
    ]);
    await context.addInitScript(() => {
      sessionStorage.setItem("jdatna:push-later", "1");
      sessionStorage.setItem("jdatna:family-welcome", "1");
    });
  };

  test("a customer posts a request from (+), and saves a family to «دليلي»", async ({
    page,
    context,
    baseURL,
  }, info) => {
    await as(context, tc, baseURL!);
    await page.goto("/");
    const bar = page.getByRole("navigation", { name: "القائمة السفلية" });
    if (info.project.name === "mobile") {
      await expect(bar).toBeVisible();
      await bar.getByRole("link", { name: "اطلب" }).click();
      await expect(page).toHaveURL(/\/requests\?new=1/);
    } else {
      // على الشاشة العريضة لا قائمة سفلية.
      await expect(bar).toBeHidden();
      await page.goto("/requests?new=1");
    }
    await page.getByLabel("وش تطلب؟").fill(body);
    await page.getByLabel("المدينة").selectOption({ index: 1 });
    await page.getByRole("button", { name: "انشر طلبي" }).click();
    await expect(page.getByRole("status")).toContainText("نُشر طلبك");
    await expect(page.getByText(body)).toBeVisible();

    await page.goto(`/producers/${slug}`);
    await page.getByRole("button", { name: "أضف إلى دليلي" }).click();
    await expect(page.getByRole("link", { name: "✓ في دليلي" })).toBeVisible();
    await page.goto("/directory");
    await expect(
      page.getByRole("region", { name: "الأسر المنتجة" }),
    ).toContainText("مطبخ الدليل");
    // جهة يدوية.
    await page.getByRole("button", { name: "＋ إضافة يدوية" }).click();
    await page.getByLabel("الاسم").fill("أبو فهد");
    await page.getByLabel("الجوال").fill("0551234567");
    await page.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(page.getByRole("region", { name: "جهاتي" })).toContainText(
      "أبو فهد",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

  test("the family sees the request without the customer's name, and its (+) adds a product", async ({
    page,
    context,
    baseURL,
  }, info) => {
    await as(context, tf, baseURL!);
    await page.goto("/requests");
    const card = page.getByRole("listitem").filter({ hasText: body });
    await expect(card).toBeVisible();
    // لم يوافق العميل على إظهار اسمه.
    await expect(card).toContainText("عميل");
    await expect(card).not.toContainText("عميلة الدليل");
    await card.getByRole("button", { name: "راسل صاحب الطلب" }).click();
    await expect(page).toHaveURL(/\/messages\?c=/);
    if (info.project.name === "mobile") {
      await page
        .getByRole("navigation", { name: "القائمة السفلية" })
        .getByRole("link", { name: "إضافة منتج" })
        .click();
      await expect(page).toHaveURL(/\/dashboard\/products/);
      await expect(page.locator("form[data-product-form]")).toBeVisible();
    }
  });
});
