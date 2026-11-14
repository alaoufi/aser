import { test, expect } from "@playwright/test";
import { Pool } from "pg";

// أزرار المتجرين أسفل الموقع: تظهر بعد تفعيلها من «الإدارة ← تطبيق الجوال»، وتختفي داخل التطبيقين.
test.describe("store download buttons in the footer", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database",
  );
  test.describe.configure({ mode: "serial" });
  let pool: Pool | undefined,
    previous: string | undefined,
    started = false;
  const save = (value: unknown) =>
    pool!.query(
      `INSERT INTO jdatna.site_settings(key,value,updated_at) VALUES('app:links',$1,now())
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
      [JSON.stringify(value)],
    );
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (await pool.query("SELECT current_database() AS name")).rows[0].name,
    ).toMatch(/^jdatna_test_/);
    started = true;
    previous = (
      await pool.query(
        "SELECT value FROM jdatna.site_settings WHERE key='app:links'",
      )
    ).rows[0]?.value;
  });
  test.afterAll(async () => {
    if (started) {
      if (previous === undefined)
        await pool!.query(
          "DELETE FROM jdatna.site_settings WHERE key='app:links'",
        );
      else
        await pool!.query(
          "UPDATE jdatna.site_settings SET value=$1 WHERE key='app:links'",
          [previous],
        );
    }
    await pool?.end();
  });

  test("hidden until enabled, then both stores show on the website but not inside the apps", async ({
    browser,
  }) => {
    const base = {
      androidPackage: "",
      androidFingerprints: [],
      iosAppIds: [],
    };
    await save({ ...base, showAppStore: false, showPlayStore: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("footer")).toBeVisible();
    await expect(page.getByTestId("store-badges")).toHaveCount(0);

    await save({ ...base, showAppStore: true, showPlayStore: true });
    await page.goto("/");
    const badges = page.getByTestId("store-badges");
    await expect(
      badges.getByRole("link", { name: "حمّل من App Store" }),
    ).toHaveAttribute("href", "https://apps.apple.com/app/id6833382132");
    await expect(
      badges.getByRole("link", { name: "احصل عليه من Google Play" }),
    ).toHaveAttribute(
      "href",
      "https://play.google.com/store/apps/details?id=com.jdatna.app",
    );

    // داخل تطبيق الآيفون (?source=ios) وأندرويد (?source=app): لا أزرار، وتبقى مخفية بالتنقل.
    for (const source of ["ios", "app"]) {
      const app = await context.newPage();
      await app.goto(`/?source=${source}`);
      await expect(app.locator("footer")).toBeVisible();
      await app.goto("/about");
      await expect(app.locator("footer")).toBeVisible();
      await expect(app.getByTestId("store-badges")).toHaveCount(0);
      await app.close();
    }
    await context.close();
  });
});
