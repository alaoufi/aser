import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

/**
 * فلاتر «تصفح» في الواجهة مقابل البيانات الفعلية (فحص الفلاتر 2026-11-25):
 * - ما يُعرض للمستخدم يطابق قاعدة البيانات بالضبط (لا عدد الأزرار فقط).
 * - الترقيم: كل المطابق يصل عبر الصفحات بلا تكرار، والعدد الظاهر هو العدد الكامل.
 * - القسم الأب يشمل منتجات قسمه الابن.
 * - التبديل السريع المتكرر بين الفلاتر ينتهي بنتيجة آخر فلتر لا غيره.
 * - على الكمبيوتر والجوال (المشروعان) والتابلت.
 * المنتجات «طلب مسبق» حتى لا تؤثر على اختبارات «مائدة اليوم».
 */
test.describe("browse filters show exactly the matching data", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database environment",
  );
  // تُجدَّد في كل beforeAll: المشروعان (كمبيوتر وجوال) يشغّلان الملف في العامل نفسه.
  let tag = "",
    mark = "",
    parent = "",
    child = "",
    other = "";
  let users: string[] = [];
  let fams: string[] = [];
  let items: string[] = [];
  let pool: Pool;
  let region = "";
  // اسم المنتج ← قسمه، كما زُرع.
  let seeded: { id: string; category: string; region: string }[] = [];

  test.beforeAll(async () => {
    tag = randomUUID().replace(/[\d-]/g, "").slice(0, 8);
    mark = `فلترتصفح${tag}`;
    parent = `fe-p-${tag}`;
    child = `fe-c-${tag}`;
    other = `fe-o-${tag}`;
    users = [];
    fams = [];
    items = [];
    seeded = [];
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (
        (await pool.query("SELECT current_database() AS n")).rows[0].n as string
      ).startsWith("jdatna_test_"),
    ).toBe(true);
    const [here, there] = (
      await pool.query(
        "SELECT DISTINCT ON (region_id) id,region_id FROM jdatna.cities ORDER BY region_id,id LIMIT 2",
      )
    ).rows;
    region = here.region_id;
    await pool.query(
      `INSERT INTO jdatna.categories(id,name,slug,parent_id) VALUES
       ($1,'حلويات واجهة',$1,NULL),($2,'كليجا واجهة',$2,$1),($3,'مشروبات واجهة',$3,NULL)`,
      [parent, child, other],
    );
    // أسرتان: 30 منتجًا في منطقة الزائر، و5 في منطقة أخرى (منها 2 تُشحن للمملكة).
    const plan: [
      string,
      number,
      (i: number) => string,
      (i: number) => string,
    ][] = [
      [here.id, 30, (i) => (i % 2 ? child : other), () => "coverage"],
      [there.id, 5, () => parent, (i) => (i < 2 ? "kingdom" : "coverage")],
    ];
    for (const [city, count, cat, scope] of plan) {
      const user = randomUUID(),
        fam = randomUUID();
      users.push(user);
      fams.push(fam);
      const phone =
        "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,'producer',now())",
        [user, "أسرة فلتر", phone],
      );
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,$4,$5,$6,'approved')",
        [fam, user, `fe-${fam}`, `أسرة الفلتر ${tag}`, city, phone],
      );
      for (let i = 0; i < count; i++) {
        const id = randomUUID();
        items.push(id);
        await pool.query(
          `INSERT INTO jdatna.products(id,producer_id,name,description,unit,status,delivery_scope,created_at)
           VALUES($1,$2,$3,$4,'صحن','preorder',$5,now()-($6::int * interval '1 second'))`,
          [id, fam, `صحن ${i + 1}`, mark, scope(i), i],
        );
        await pool.query(
          "INSERT INTO jdatna.product_categories(product_id,category_id) VALUES($1,$2)",
          [id, cat(i)],
        );
        seeded.push({
          id,
          category: cat(i),
          region: city === here.id ? here.region_id : there.region_id,
        });
      }
    }
  });
  test.afterAll(async () => {
    if (!pool) return;
    await pool.query(
      "DELETE FROM jdatna.product_categories WHERE product_id=ANY($1::uuid[])",
      [items],
    );
    await pool.query("DELETE FROM jdatna.products WHERE id=ANY($1::uuid[])", [
      items,
    ]);
    await pool.query(
      "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
      [fams],
    );
    await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
      users,
    ]);
    await pool.query("DELETE FROM jdatna.categories WHERE id=ANY($1)", [
      [child, parent, other],
    ]);
    await pool.end();
  });

  // معرّفات منتجات النتائج الرئيسية (لا قسم «يُشحن لكل المناطق»).
  const shown = async (page: Page) =>
    (
      await page
        // شبكة نتائج المنتجات وحدها (قوائم الأسر شبكات أخرى فوقها).
        .locator('[data-results="products"] a.product-card')
        .evaluateAll((as) =>
          as.map((a) => (a.getAttribute("href") ?? "").split("/").pop() ?? ""),
        )
    ).filter(Boolean);
  // كل الصفحات عبر زر «التالي»، مع التحقق من عدم التكرار.
  const allPages = async (page: Page, url: string) => {
    await page.goto(url);
    const ids: string[] = [];
    for (let n = 1; n < 10; n++) {
      ids.push(...(await shown(page)));
      const next = page.getByRole("link", { name: "التالي", exact: true });
      if (!(await next.count())) break;
      await next.click();
      await expect(page).toHaveURL(new RegExp(`page=${n + 1}`));
    }
    expect(new Set(ids).size, "منتج مكرر بين الصفحات").toBe(ids.length);
    return ids;
  };
  const want = (f: (s: (typeof seeded)[number]) => boolean) =>
    seeded
      .filter(f)
      .map((s) => s.id)
      .sort();

  test("all 35 matches reach the user across pages, with the full count", async ({
    page,
  }) => {
    const ids = await allPages(page, `/browse?q=${encodeURIComponent(mark)}`);
    expect(ids.sort()).toEqual(want(() => true));
    await page.goto(`/browse?q=${encodeURIComponent(mark)}`);
    // العدد الظاهر هو العدد الكامل، لا عدد الصفحة الأولى (24).
    await expect(page.locator(".results-heading h2").first()).toContainText(
      "35",
    );
    await expect(page.getByText("صفحة 1 من 2")).toBeVisible();
  });

  test("parent category includes its child category; region narrows to the region", async ({
    page,
  }) => {
    const q = `q=${encodeURIComponent(mark)}`;
    expect(
      (await allPages(page, `/browse?${q}&category=${parent}`)).sort(),
    ).toEqual(want((s) => s.category === parent || s.category === child));
    expect(
      (await allPages(page, `/browse?${q}&category=${child}`)).sort(),
    ).toEqual(want((s) => s.category === child));
    expect(
      (await allPages(page, `/browse?${q}&region=${region}`)).sort(),
    ).toEqual(want((s) => s.region === region));
    // منطقة + قسم معًا.
    expect(
      (
        await allPages(page, `/browse?${q}&region=${region}&category=${other}`)
      ).sort(),
    ).toEqual(want((s) => s.region === region && s.category === other));
  });

  test("rapid repeated filter switching ends on the last choice only", async ({
    page,
  }) => {
    const q = `q=${encodeURIComponent(mark)}`;
    await page.goto(`/browse?${q}`);
    // تنقل سريع متتالٍ بلا انتظار: آخر طلب هو الذي يُعرض.
    const urls = [
      `/browse?${q}&category=${parent}`,
      `/browse?${q}&category=${other}`,
      `/browse?${q}&region=${region}`,
      `/browse?${q}&category=${child}`,
    ];
    // كل النقرات في سكربت واحد متتابع بلا انتظار (كمستخدم يضغط بسرعة).
    await page.evaluate((list) => {
      for (const href of list) {
        const a = document.createElement("a");
        a.href = href;
        document.body.append(a);
        a.click();
      }
    }, urls);
    await expect(page).toHaveURL(new RegExp(`category=${child}`));
    await expect(async () => {
      expect((await shown(page)).sort()).toEqual(
        want((s) => s.category === child),
      );
    }).toPass({ timeout: 15_000 });
  });

  test("results load quickly", async ({ page }) => {
    const times: number[] = [];
    for (const extra of ["", `&category=${parent}`, `&region=${region}`]) {
      const t0 = Date.now();
      await page.goto(`/browse?q=${encodeURIComponent(mark)}${extra}`);
      await page.locator('[data-results="products"]').waitFor();
      times.push(Date.now() - t0);
    }
    console.log(`browse filter page loads (ms): ${times.join(", ")}`);
    // بيئة التطوير أبطأ من الإنتاج؛ الحد هنا لكشف التراجع الكبير فقط.
    expect(Math.max(...times)).toBeLessThan(8000);
  });

  test.describe("tablet", () => {
    test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });
    test("filters and pages work on a tablet", async ({ page }) => {
      const ids = await allPages(
        page,
        `/browse?q=${encodeURIComponent(mark)}&category=${parent}`,
      );
      expect(ids.sort()).toEqual(
        want((s) => s.category === parent || s.category === child),
      );
    });
  });
});
