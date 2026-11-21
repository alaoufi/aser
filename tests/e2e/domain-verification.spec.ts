import { test, expect } from "@playwright/test";
import { Pool } from "pg";

// إثبات ملكية النطاق (المركز السعودي للأعمال): الرمز المحفوظ من الإدارة يظهر وسمًا في <head> الرئيسية.
test.describe("domain verification meta tag", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database",
  );
  test.describe.configure({ mode: "serial" });
  const code =
    "aed803b71f263ba31aa9162eca5e837d59c709569175f3879002a44cf3b04496";
  let pool: Pool | undefined;
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (await pool.query("SELECT current_database() AS name")).rows[0].name,
    ).toMatch(/^jdatna_test_/);
  });
  test.afterAll(async () => {
    await pool?.query(
      "DELETE FROM jdatna.site_settings WHERE key='verify:domain'",
    );
    await pool?.end();
  });

  test("the saved code appears in the home page head, and disappears when cleared", async ({
    request,
  }) => {
    await pool!.query(
      `INSERT INTO jdatna.site_settings(key,value,updated_at) VALUES('verify:domain',$1,now())
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`,
      [code],
    );
    const html = await (await request.get("/")).text();
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).toContain(
      `<meta name="domain-verification" content="${code}"/>`,
    );
    await pool!.query(
      "DELETE FROM jdatna.site_settings WHERE key='verify:domain'",
    );
    const after = await (await request.get("/")).text();
    expect(after).not.toContain("domain-verification");
  });
});

test("the owner pastes the full tag in the admin tab and saves the code", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: { id: "a", name: "مدير", phone: "+966500000009", role: "admin" },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/admin/summary", (r) =>
    r.fulfill({ json: { summary: {} } }),
  );
  let saved: unknown;
  let stored = "";
  await page.route("**/api/admin/verification", async (r) => {
    if (r.request().method() === "PUT") {
      saved = r.request().postDataJSON();
      stored = "abc123def456";
    }
    return r.fulfill({ json: { code: stored } });
  });
  await page.goto("/admin?tab=verification");
  const section = page.getByRole("heading", { name: "إثبات ملكية النطاق" });
  await expect(section).toBeVisible();
  await page
    .getByLabel("رمز التحقق أو الوسم كاملًا")
    .fill('<meta name="domain-verification" content="abc123def456">');
  await page.getByRole("button", { name: "حفظ" }).click();
  await expect
    .poll(() => saved)
    .toEqual({
      code: '<meta name="domain-verification" content="abc123def456">',
    });
  await expect(page.locator("main")).toContainText(
    '<meta name="domain-verification" content="abc123def456">',
  );
});
