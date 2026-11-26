import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

/**
 * صفحة الأسرة بلا منتجات في القالب المبسّط (2026-11-26): زر «اسأل عن قائمة اليوم بالواتساب» برقم
 * الأسرة المعلن، ورسالة القائمة، وأسر قريبة **لديها منتجات** من القاعدة فقط (لا أسرة بلا منتجات،
 * ولا الأسرة نفسها). والكلاسيكي يبقى كما هو. قاعدة اختبار معزولة فقط، وتُحذف بياناتها بعده.
 */
test.describe("simplified family page without dishes", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database environment",
  );
  let pool: Pool;
  const users: string[] = [];
  const fams: { id: string; slug: string; products: number }[] = [];
  let phone = "";
  let dish = "";

  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (
        (await pool.query("SELECT current_database() AS n")).rows[0].n as string
      ).startsWith("jdatna_test_"),
    ).toBe(true);
    const city = (
      await pool.query(
        "SELECT id FROM jdatna.cities ORDER BY region_id,id LIMIT 1",
      )
    ).rows[0].id as string;
    // الأولى بلا منتجات (الصفحة المختبرة)، والثانية لها طبق، والثالثة بلا منتجات (لا تظهر قريبة).
    for (const products of [0, 1, 0]) {
      const user = randomUUID();
      const id = randomUUID();
      const slug = `look-${id.slice(0, 8)}`;
      const ph =
        "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
      if (!phone) phone = ph;
      users.push(user);
      fams.push({ id, slug, products });
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'أسرة مظهر',$2,'producer',now())",
        [user, ph],
      );
      await pool.query(
        `INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,whatsapp,show_whatsapp,status)
         VALUES($1,$2,$3,$4,$5,$6,$6,true,'approved')`,
        [id, user, slug, `أسرة المظهر ${slug}`, city, ph],
      );
      if (products) {
        dish = randomUUID();
        // متوفر اليوم بسعر: يظهر على «مائدة اليوم» في الرئيسية المبسّطة.
        await pool.query(
          "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status,price) VALUES($1,$2,$3,'','صحن','available',35)",
          [dish, id, `مطازيز المائدة ${slug}`],
        );
      }
    }
  });
  test.afterAll(async () => {
    const ids = fams.map((f) => f.id);
    await pool.query(
      "DELETE FROM jdatna.products WHERE producer_id=ANY($1::uuid[])",
      [ids],
    );
    await pool.query(
      "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
      [ids],
    );
    await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
      users,
    ]);
    await pool.end();
  });

  test("asks for today's menu on WhatsApp and lists nearby families that publish dishes", async ({
    page,
  }) => {
    const [empty, withDish, alsoEmpty] = fams;
    await page.context().addCookies([
      {
        name: "jdatna_template",
        value: "simple",
        url: "http://127.0.0.1:3000",
      },
    ]);
    await page.goto(`/producers/${empty.slug}`);
    await expect(
      page.getByRole("heading", { name: "القائمة لم تُنشر هنا بعد" }),
    ).toBeVisible();
    await expect(
      page.getByText("كثير من الأسر تطبخ حسب الطلب؛ اسألهم بالواتساب"),
    ).toBeVisible();
    const ask = page.getByRole("link", {
      name: /اسأل عن قائمة اليوم بالواتساب/,
    });
    await expect(ask).toBeVisible();
    expect(await ask.getAttribute("href")).toContain(
      `https://wa.me/${phone.replace("+", "")}`,
    );
    // الإجراء الأساسي قبل لوحة التواصل الطويلة (على الجوال أيضًا).
    const askTop = (await ask.boundingBox())!.y;
    const panelTop = (await page
      .getByRole("heading", { name: "تواصل مع الأسرة المنتجة" })
      .boundingBox())!.y;
    // على الشاشات الضيقة يتتابعان عموديًا؛ على الكمبيوتر يتجاوران.
    if ((page.viewportSize()?.width ?? 1280) <= 850)
      expect(askTop).toBeLessThan(panelTop);
    const nearby = page.getByRole("region", { name: "أسر قريبة نشرت أطباقها" });
    await expect(
      nearby.locator(`a[href="/producers/${withDish.slug}"]`),
    ).toHaveCount(1);
    await expect(
      nearby.locator(`a[href="/producers/${alsoEmpty.slug}"]`),
    ).toHaveCount(0);
    await expect(
      nearby.locator(`a[href="/producers/${empty.slug}"]`),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    // الكلاسيكي: كما كان.
    await page.context().addCookies([
      {
        name: "jdatna_template",
        value: "classic",
        url: "http://127.0.0.1:3000",
      },
    ]);
    await page.reload();
    await expect(page.getByText("لم تُنشر منتجات بعد")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /اسأل عن قائمة اليوم/ }),
    ).toHaveCount(0);
  });

  test("«مائدة اليوم» on the simplified home shows a real dish available today with its price and family", async ({
    page,
  }) => {
    await page.context().addCookies([
      {
        name: "jdatna_template",
        value: "simple",
        url: "http://127.0.0.1:3000",
      },
    ]);
    await page.goto("/");
    const table = page.getByRole("region", { name: "مائدة اليوم" });
    const card = table.locator(`a[href="/products/${dish}"]`);
    await expect(card).toBeVisible();
    await expect(card).toContainText("مطازيز المائدة");
    await expect(card).toContainText(/35|٣٥/);
    await expect(card).toContainText("أسرة المظهر");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});
