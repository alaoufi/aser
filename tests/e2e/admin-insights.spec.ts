import { expect, test } from "@playwright/test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";

/**
 * إحصاءات الإدارة الرئيسية في المتصفح (قاعدة اختبار معزولة فقط):
 * المربعات تعرض أرقام البيانات المزروعة، وتغيير المدة يغيّرها، و«تصدير PDF» يطبع القسم وحده،
 * ومربعان في السطر على الجوال. المدير يدخل بجلسة لوحة مزروعة (لا رسائل ولا كلمات مرور).
 */
test.describe("admin statistics", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database environment",
  );
  let pool: Pool;
  const tag = randomUUID().slice(0, 8);
  const adminId = randomUUID(),
    customer = randomUUID(),
    owner = randomUUID(),
    family = randomUUID(),
    product = randomUUID();
  const orders: string[] = [];
  const site = randomBytes(32).toString("hex"),
    panel = randomBytes(32).toString("hex");
  const sha = (v: string) => createHash("sha256").update(v).digest("hex");
  const phone = () =>
    "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
    ).toMatch(/^jdatna_test_/);
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'مدير الإحصاء',$2,'admin',now()),($3,'عميل الإحصاء',$4,'customer',now()),($5,'أسرة الإحصاء',$6,'producer',now())",
      [adminId, phone(), customer, phone(), owner, phone()],
    );
    await pool.query(
      "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,$4,(SELECT id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' LIMIT 1),$5,'approved')",
      [family, owner, `ins-e2e-${tag}`, `أسرة الإحصاء ${tag}`, phone()],
    );
    await pool.query(
      "INSERT INTO jdatna.products(id,producer_id,name,description,unit,price,status,visible) VALUES($1,$2,$3,'','صحن',25,'available',true)",
      [product, family, `صحن الإحصاء ${tag}`],
    );
    // 3 طلبات في الأسبوع الأخير، وطلب قبل 60 يومًا (خارج «30 يومًا»، داخل «90 يومًا»).
    for (const [ago, status] of [
      [1, "completed"],
      [2, "completed"],
      [3, "pending"],
      [60, "completed"],
    ] as const) {
      const id = randomUUID();
      orders.push(id);
      await pool.query(
        `INSERT INTO jdatna.order_requests(id,request_key,request_hash,user_id,producer_id,product_id,snapshot,customer_name,phone,quantity,meal,start_date,end_date,status,created_at)
         VALUES($1::uuid,$1::uuid,$1::text,$2,$3,$4,$5,'عميل',$6,2,'lunch',current_date,current_date,$7,now()-$8::int*interval '1 day')`,
        [
          id,
          customer,
          family,
          product,
          { productName: "صحن", unit: "صحن", price: 25, producerName: "أسرة" },
          phone(),
          status,
          ago,
        ],
      );
    }
    await pool.query(
      "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [sha(site), adminId],
    );
    await pool.query(
      "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at,scope) VALUES($1,$2,now()+interval '1 hour','admin')",
      [sha(panel), adminId],
    );
  });
  test.afterAll(async () => {
    await pool.query("DELETE FROM jdatna.order_requests WHERE id=ANY($1)", [
      orders,
    ]);
    await pool.query("DELETE FROM jdatna.products WHERE id=$1", [product]);
    await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
      family,
    ]);
    await pool.query("DELETE FROM jdatna.sessions WHERE user_id=$1", [adminId]);
    await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1)", [
      [adminId, customer, owner],
    ]);
    await pool.end();
  });

  test("tiles show the data, the range changes it, and PDF export prints the section", async ({
    page,
    context,
    baseURL,
  }) => {
    const host = new URL(baseURL ?? "http://127.0.0.1:3000").hostname;
    await context.addCookies([
      { name: "jdatna_session", value: site, domain: host, path: "/" },
      { name: "jdatna_admin", value: panel, domain: host, path: "/" },
    ]);
    await page.addInitScript(() => {
      // نافذة «أسر تنتظر الموافقة» (2026-11-28) لها اختبارها؛ هنا تُعدّ مرئية سابقًا.
      sessionStorage.setItem("jdatna:pending-families-seen", "1");
      (window as unknown as { printed: number }).printed = 0;
      window.print = () => {
        (window as unknown as { printed: number }).printed++;
      };
    });
    await page.goto("/admin");
    const stats = page.locator(".insights-print");
    await expect(
      stats.getByRole("heading", { name: "الإحصاءات" }),
    ).toBeVisible();
    // الأسرة المزروعة في «الأكثر طلبًا» بعدد طلباتها في آخر 30 يومًا.
    const families = stats.getByRole("figure", { name: "الأسر الأكثر طلبًا" });
    await expect(families).toContainText(`أسرة الإحصاء ${tag}`);
    await expect(
      families.locator("li", { hasText: `أسرة الإحصاء ${tag}` }),
    ).toContainText("3");
    await page.screenshot({
      path: "test-results/admin-insights.png",
      fullPage: true,
    });
    // 90 يومًا: يدخل الطلب الرابع.
    await stats.getByRole("button", { name: "90 يومًا" }).click();
    await expect(
      families.locator("li", { hasText: `أسرة الإحصاء ${tag}` }),
    ).toContainText("4");
    await expect(
      stats.getByRole("button", { name: "90 يومًا" }),
    ).toHaveAttribute("aria-pressed", "true");
    // التصدير: يطبع القسم وحده.
    await stats.getByRole("button", { name: "تصدير PDF" }).click();
    expect(
      await page.evaluate(
        () => (window as unknown as { printed: number }).printed,
      ),
    ).toBe(1);
    expect(
      await page.evaluate(() =>
        document.body.classList.contains("print-insights"),
      ),
    ).toBe(true);
    await page.emulateMedia({ media: "print" });
    await expect(
      stats.getByText("أكلات جدتنا — تقرير الإحصاءات"),
    ).toBeVisible();
    await expect(stats.getByRole("button", { name: "تصدير PDF" })).toBeHidden();
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() => document.body.classList.remove("print-insights"));
    // واتساب: ملخص نصي جاهز في رابط wa.me.
    await page.evaluate(() => {
      (window as unknown as { opened: string[] }).opened = [];
      window.open = ((url: string) => {
        (window as unknown as { opened: string[] }).opened.push(url);
        return null;
      }) as typeof window.open;
    });
    await stats.getByRole("button", { name: "ملخص واتساب" }).click();
    const opened = await page.evaluate(
      () => (window as unknown as { opened: string[] }).opened,
    );
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatch(/^https:\/\/wa\.me\/\?text=/);
    const text = decodeURIComponent(opened[0].split("text=")[1]);
    expect(text).toContain("أكلات جدتنا — ملخص الإحصاءات (آخر 90 يومًا)");
    expect(text).toContain("الطلبات: 4");
    // ملف PDF: على المتصفح بلا مشاركة ملفات يُحفظ في الجهاز.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      stats.getByRole("button", { name: "مشاركة PDF" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^jdatna-insights-90d-.*\.pdf$/,
    );
    const path = await download.path();
    const { readFileSync } = await import("node:fs");
    const bytes = readFileSync(path);
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(20_000);
    await expect(stats.getByText("حُفظ ملف PDF في جهازك")).toBeVisible();
    // على الجوال: مربعان في السطر.
    const width = page.viewportSize()?.width ?? 1280;
    if (width <= 600) {
      const tops = await stats
        .locator("[data-tile]")
        .evaluateAll((els) =>
          els.slice(0, 2).map((e) => e.getBoundingClientRect().top),
        );
      expect(Math.abs(tops[0] - tops[1])).toBeLessThan(1);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});
