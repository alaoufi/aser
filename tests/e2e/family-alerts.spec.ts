import { expect, test } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";

/**
 * «تنبيهات الأسرة» في المتصفح (2026-11-26) على قاعدة اختبار معزولة:
 * - العضو يضغط «نبّهني»؛ التفعيل معطل حتى يوافق صراحة؛ ثم «التنبيهات مفعّلة».
 * - الأسرة تضيف منتجًا (واجهة برمجة الموقع نفسها) ← يصل العضو تنبيه في «تنبيهاتي» بالنص المعتمد.
 * - الأسرة تضيف جدول توزيع من «جدول التوزيع» ← تنبيه بداية التوزيع، مرة واحدة.
 * - الإيقاف المؤقت والإلغاء من «تنبيهاتي»، والإلغاء من رابط التنبيه.
 * - الزائر بلا حساب يرى رابط الدخول. على 390/768/1280 بلا تجاوز أفقي.
 * الإرسال يُشغَّل من الاختبار (الدورة الدورية في الخادم كل خمس دقائق).
 */
test.describe("family alerts", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database environment",
  );
  test.describe.configure({ mode: "serial" });
  let pool: Pool;
  const ids = { family: "", member: "", producer: "", product: "" };
  const tokens = {
    family: randomBytes(32).toString("hex"),
    member: randomBytes(32).toString("hex"),
  };
  let slug = "";
  let category = "";
  let city = "";
  let region = "";
  const dispatch = async () => {
    process.env.FAMILY_ALERTS_TIMER = "off";
    const fa = await import("../../src/server/family-alerts");
    const { siteTextDefaults } = await import("../../src/lib/site-texts");
    fa.setAlertChannels([]);
    return fa.dispatchFamilyAlerts({
      graceSeconds: 0,
      texts: { ...siteTextDefaults },
    });
  };
  const ph = () =>
    "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");

  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (
        (await pool.query("SELECT current_database() AS n")).rows[0].n as string
      ).startsWith("jdatna_test_"),
    ).toBe(true);
    // منطقة ومدينة خاصتان بالاختبار، وقسم رسمي ثابت: لا تتداخل الأسرة مع اختبارات أخرى تعمل بالتوازي.
    city = `fa-city-${randomUUID().slice(0, 8)}`;
    region = `fa-region-${randomUUID().slice(0, 8)}`;
    await pool.query("INSERT INTO jdatna.regions(id,name) VALUES($1,$1)", [
      region,
    ]);
    await pool.query(
      "INSERT INTO jdatna.cities(id,name,region_id) VALUES($1,$1,$2)",
      [city, region],
    );
    category = "1";
    ids.family = randomUUID();
    ids.member = randomUUID();
    ids.producer = randomUUID();
    ids.product = randomUUID();
    slug = `fa-${ids.producer.slice(0, 8)}`;
    for (const [id, role] of [
      [ids.family, "producer"],
      [ids.member, "customer"],
    ])
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'تجربة التنبيهات',$2,$3,now())",
        [id, ph(), role],
      );
    await pool.query(
      `INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,description,city_id,phone,status)
       VALUES($1,$2,$3,'أسرة التنبيهات','أسرة لاختبار التنبيهات فقط.',$4,$5,'approved')`,
      [ids.producer, ids.family, slug, city, ph()],
    );
    await pool.query(
      "INSERT INTO jdatna.producer_categories(producer_id,category_id) VALUES($1,$2)",
      [ids.producer, category],
    );
    await pool.query(
      "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status) VALUES($1,$2,'صحن أول','وصف الصحن الأول','صحن','preorder')",
      [ids.product, ids.producer],
    );
    for (const [t, u] of [
      [tokens.family, ids.family],
      [tokens.member, ids.member],
    ])
      await pool.query(
        "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES(encode(sha256(convert_to($1,'UTF8')),'hex'),$2,now()+interval '1 hour')",
        [t, u],
      );
  });
  test.afterAll(async () => {
    const users = [ids.family, ids.member];
    await pool.query(
      "DELETE FROM jdatna.sessions WHERE user_id=ANY($1::uuid[])",
      [users],
    );
    await pool.query(
      "DELETE FROM jdatna.member_alerts WHERE user_id=ANY($1::uuid[])",
      [users],
    );
    await pool.query(
      "DELETE FROM jdatna.family_alerts_sent WHERE user_id=ANY($1::uuid[])",
      [users],
    );
    await pool.query(
      "DELETE FROM jdatna.family_follows WHERE user_id=ANY($1::uuid[])",
      [users],
    );
    await pool.query(
      "DELETE FROM jdatna.family_alert_events WHERE producer_id=$1",
      [ids.producer],
    );
    await pool.query(
      "DELETE FROM jdatna.product_schedules WHERE producer_id=$1",
      [ids.producer],
    );
    await pool.query(
      "DELETE FROM jdatna.product_categories WHERE product_id IN (SELECT id FROM jdatna.products WHERE producer_id=$1)",
      [ids.producer],
    );
    await pool.query("DELETE FROM jdatna.products WHERE producer_id=$1", [
      ids.producer,
    ]);
    await pool.query(
      "DELETE FROM jdatna.producer_categories WHERE producer_id=$1",
      [ids.producer],
    );
    await pool
      .query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [ids.producer])
      .catch(() => {});
    await pool
      .query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [users])
      .catch(() => {});
    await pool
      .query("DELETE FROM jdatna.cities WHERE id=$1", [city])
      .catch(() => {});
    await pool
      .query("DELETE FROM jdatna.regions WHERE id=$1", [region])
      .catch(() => {});
    await pool.end();
  });

  test("a visitor without an account is asked to log in", async ({ page }) => {
    await page.goto(`/producers/${slug}`);
    await expect(
      page.getByRole("link", { name: /سجّل الدخول لتفعيل التنبيهات/ }),
    ).toBeVisible();
  });

  test("subscribe with explicit consent, then a new product reaches «تنبيهاتي» once", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: "jdatna_session", value: tokens.member, url: baseURL! },
    ]);
    await context.addInitScript(() =>
      sessionStorage.setItem("jdatna:family-welcome", "1"),
    );
    for (const [w, h] of [
      [390, 844],
      [768, 1024],
      [1280, 900],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/producers/${slug}`);
      await page
        .getByRole("button", { name: /نبّهني|التنبيهات مفعّلة/ })
        .click();
      const panel = page.getByRole("dialog", {
        name: "تنبيهات أسرة التنبيهات",
      });
      await expect(panel).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `no overflow at ${w}`,
      ).toBe(true);
      await page.keyboard.press("Escape");
    }
    await page.getByRole("button", { name: "نبّهني", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "تنبيهات أسرة التنبيهات" });
    const save = panel.getByRole("button", { name: "تفعيل التنبيهات" });
    await expect(save).toBeDisabled();
    await panel
      .getByRole("checkbox", { name: /أوافق على استلام تنبيهات/ })
      .check();
    await expect(save).toBeEnabled();
    await save.click();
    await expect(
      page.getByRole("button", { name: /التنبيهات مفعّلة/ }),
    ).toBeVisible();

    // الأسرة تضيف منتجًا من واجهة الموقع نفسها.
    const created = await page.request.post("/api/producer/products", {
      headers: {
        Cookie: `jdatna_session=${tokens.family}`,
        Origin: baseURL!,
        "Content-Type": "application/json",
      },
      data: {
        name: "مطازيز التنبيه",
        description: "مطازيز بيتية للتجربة",
        price: 30,
        unit: "صحن",
        status: "preorder",
        categoryIds: [category],
      },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const productId = (await created.json()).id as string;
    expect((await dispatch()).sent).toBe(1);
    expect((await dispatch()).sent).toBe(0);
    await page.goto("/alerts");
    await expect(page.getByRole("heading", { name: "تنبيهاتي" })).toBeVisible();
    await expect(
      page.getByText(
        `تمت إضافة مطازيز التنبيه من أسرة التنبيهات. للطلب تواصل معهم:`,
      ),
    ).toBeVisible();
    await expect(page.locator(`a[href$="/products/${productId}"]`)).toHaveCount(
      1,
    );
  });

  test("a distribution schedule added by the family alerts followers once; pause, cancel and the unsubscribe link work", async ({
    page,
    context,
    baseURL,
  }) => {
    // الأسرة: «جدول التوزيع» وعدد المتابعين فقط.
    await context.addCookies([
      { name: "jdatna_session", value: tokens.family, url: baseURL! },
    ]);
    await context.addInitScript(() =>
      sessionStorage.setItem("jdatna:family-welcome", "1"),
    );
    await page.goto("/dashboard/schedules");
    await expect(page.getByTestId("family-followers")).toHaveText(
      "متابعو تنبيهات أسرتك: 1",
    );
    await page
      .getByRole("combobox", { name: "المنتج", exact: true })
      .selectOption({ label: "صحن أول" });
    await page
      .getByRole("combobox", { name: "التكرار", exact: true })
      .selectOption("weekly");
    await page.getByRole("checkbox", { name: "الخميس" }).check();
    await page.getByRole("button", { name: "إضافة الجدول" }).click();
    await expect(
      page.getByRole("list", { name: "جدول التوزيع" }),
    ).toContainText("صحن أول");
    // محتوى الصفحة بلا تجاوز. (ترويسة حساب الأسرة عند 1280 تتجاوز في كل صفحات اللوحة: قائم قبل هذه الميزة.)
    expect(
      await page.evaluate(
        () => document.querySelector("main")!.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await dispatch()).sent).toBe(1);
    expect((await dispatch()).sent).toBe(0);
    // صفحة المنتج تعرض الجدول.
    await page.goto(`/products/${ids.product}`);
    await expect(page.getByText(/يُوزَّع أسبوعيًا \(الخميس\)/)).toBeVisible();

    // العضو: يرى تنبيه بداية التوزيع، ثم يوقف ويستأنف ويلغي.
    await context.clearCookies();
    await context.addCookies([
      { name: "jdatna_session", value: tokens.member, url: baseURL! },
    ]);
    await page.goto("/alerts");
    await expect(
      page.getByText("بدأ توزيع صحن أول أسبوعيًا من أسرة التنبيهات. اطلبه:"),
    ).toBeVisible();
    // روابط التنبيه الطويلة تلتف ولا توسّع الصفحة على الجوال.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const card = page.getByRole("region", { name: "أسرة التنبيهات" });
    await card.getByRole("button", { name: "إيقاف مؤقت" }).click();
    await expect(card.getByText("متوقفة مؤقتًا")).toBeVisible();
    await card.getByRole("button", { name: "استئناف" }).click();
    await expect(
      card.getByRole("button", { name: "إيقاف مؤقت" }),
    ).toBeVisible();

    // رابط الإلغاء في التنبيه يعمل بلا دخول وبضغطة تأكيد.
    const token = (
      await pool.query(
        "SELECT unsubscribe_token AS t FROM jdatna.family_follows WHERE user_id=$1",
        [ids.member],
      )
    ).rows[0].t as string;
    await context.clearCookies();
    await page.goto(`/alerts/unsubscribe?t=${token}`);
    await page.getByRole("button", { name: "أوقف تنبيهات هذه الأسرة" }).click();
    await expect(
      page.getByText("أُلغيت تنبيهات هذه الأسرة. لن يصلك منها شيء."),
    ).toBeVisible();
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM jdatna.family_follows WHERE user_id=$1",
          [ids.member],
        )
      ).rows[0].n,
    ).toBe(0);
  });
});
