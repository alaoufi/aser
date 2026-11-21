import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

// «الاشتراكات»: أسر المنطقة التي تقبل الاشتراك، ثم «طلب اشتراك» بالنوع وتاريخ البدء والوجبات والتوصيل،
// ثم التحويل إلى المحادثة مع الأسرة.
test.describe("subscriptions for customers", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database environment",
  );
  test.describe.configure({ mode: "serial" });
  const user = randomUUID(),
    fam = randomUUID();
  let pool: Pool | undefined,
    region = "",
    started = false;
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (
        (await pool.query("SELECT current_database() AS n")).rows[0].n as string
      ).startsWith("jdatna_test_"),
    ).toBe(true);
    started = true;
    const phone =
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const city = (
      await pool.query(
        "SELECT id,region_id FROM jdatna.cities ORDER BY id LIMIT 1",
      )
    ).rows[0];
    region = city.region_id;
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'أسرة',$2,'producer',now())",
      [user, phone],
    );
    await pool.query(
      "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status,delivery) VALUES($1,$2,$3,'مطبخ الاشتراك',$4,$5,'approved',true)",
      [fam, user, "subs-" + fam, city.id, phone],
    );
    await pool.query(
      "INSERT INTO jdatna.producer_subscription_plans(producer_id,enabled,daily,weekly,monthly,period,meals,delivery) VALUES($1,true,true,true,false,true,ARRAY['lunch','dinner'],true)",
      [fam],
    );
  });
  test.afterAll(async () => {
    try {
      if (pool && started) {
        await pool.query(
          "DELETE FROM jdatna.producer_subscription_plans WHERE producer_id=$1",
          [fam],
        );
        await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
          fam,
        ]);
        await pool.query("DELETE FROM jdatna.users WHERE id=$1", [user]);
      }
    } finally {
      await pool?.end();
    }
  });

  test("a visitor sees the family's plans and is invited to sign in", async ({
    page,
  }) => {
    await page.goto(`/subscriptions?region=${encodeURIComponent(region)}`);
    const card = page
      .getByRole("list", { name: "أسر تقبل الاشتراكات" })
      .getByRole("listitem")
      .filter({ hasText: "مطبخ الاشتراك" });
    await expect(card).toContainText("يومي");
    await expect(card).toContainText("أسبوعي");
    await expect(card).toContainText("مدة محددة");
    await expect(card).not.toContainText("شهري");
    await expect(card).toContainText("غداء · عشاء · مع التوصيل");
    await expect(
      card.getByRole("link", { name: "سجّل لطلب اشتراك" }),
    ).toBeVisible();
    // الاشتراكات في القائمة الرئيسية.
    await expect(
      page
        .getByRole("link", { name: "الاشتراكات", includeHidden: true })
        .first(),
    ).toHaveAttribute("href", "/subscriptions");
  });

  test("a customer requests a subscription and lands in the chat", async ({
    page,
  }) => {
    await page.route("**/api/session", (r) =>
      r.fulfill({
        json: {
          user: {
            id: "c",
            name: "عميل",
            phone: "+966500000055",
            role: "customer",
          },
          registrationOpen: true,
        },
      }),
    );
    let sent: Record<string, unknown> | undefined;
    await page.route("**/api/subscriptions", (r) => {
      sent = r.request().postDataJSON();
      return r.fulfill({ json: { id: "s1", conversationId: "conv-1" } });
    });
    await page.route("**/api/conversations**", (r) =>
      r.fulfill({ json: { conversations: [] } }),
    );
    await page.goto(`/subscriptions?region=${encodeURIComponent(region)}`);
    const card = page
      .getByRole("listitem")
      .filter({ hasText: "مطبخ الاشتراك" });
    await card.getByRole("button", { name: "طلب اشتراك" }).click();
    const form = card.getByRole("form", {
      name: "طلب اشتراك من مطبخ الاشتراك",
    });
    // فقط ما تتيحه الأسرة.
    await expect(form.getByRole("radio")).toHaveCount(3);
    await form.getByRole("radio", { name: "مدة محددة" }).check();
    await form.getByLabel("مدة محددة يبدأ من تاريخ").fill("2099-01-10");
    await form.getByLabel("عدد الأيام").fill("10");
    await form.getByRole("checkbox", { name: "غداء" }).check();
    await form.getByRole("checkbox", { name: "مع التوصيل" }).check();
    await form.getByLabel("موقع التوصيل").fill("حي النخيل، شارع 5");
    await form
      .getByRole("button", { name: "أرسل الطلب وانتقل للمحادثة" })
      .click();
    await expect(page).toHaveURL(/\/messages\?c=conv-1$/);
    expect(sent).toEqual({
      family: "subs-" + fam,
      plan: "period",
      startDate: "2099-01-10",
      days: 10,
      meals: ["lunch"],
      delivery: true,
      location: "حي النخيل، شارع 5",
      notes: "",
    });
  });
});

// لوحة الأسرة ← «الاشتراكات»: تختار الأنواع والوجبات والتوصيل، وترى طلبات الاشتراك مع رابط المحادثة.
test("the family sets which subscriptions it offers and sees incoming requests", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("jdatna:family-welcome", "1"),
  );
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "f",
          name: "أسرة",
          phone: "+966500000041",
          role: "producer",
          familyName: "أكلات نجدية",
        },
        registrationOpen: true,
      },
    }),
  );
  let saved: Record<string, unknown> | undefined;
  const state = {
    plan: {
      enabled: false,
      daily: false,
      weekly: false,
      monthly: false,
      period: false,
      meals: [] as string[],
      delivery: false,
      notes: "",
    },
    approved: true,
    familyDelivers: true,
    menu: [
      { id: "m1", meal: "breakfast", name: "فول، عدس، بيض مسلوق مع الخبز" },
      { id: "m2", meal: "lunch", name: "كبسة رز مع لحم" },
    ],
    schedule: {
      day: "2099-01-02",
      rows: [
        {
          id: "r1",
          customerName: "سالم",
          delivery: true,
          location: "حي",
          meal: "lunch",
          dish: "كبسة رز مع لحم",
        },
      ],
    },
    requests: [
      {
        id: "r1",
        plan: "weekly",
        startDate: "2099-01-01",
        days: null,
        meals: ["lunch"],
        delivery: true,
        location: "حي",
        notes: "",
        status: "new",
        conversationId: "conv-9",
        customerName: "سالم",
        customerAgreedAt: "2099-01-01T08:00:00.000Z",
        contractId: null,
      },
    ],
  };
  await page.route("**/api/producer/subscriptions", (r) => {
    if (r.request().method() === "PUT") {
      saved = r.request().postDataJSON();
      return r.fulfill({ json: { ...state, plan: saved } });
    }
    return r.fulfill({ json: state });
  });
  await page.goto("/dashboard/subscriptions");
  await expect(
    page.getByRole("heading", { level: 1, name: "الاشتراكات" }),
  ).toBeVisible();
  await page.getByText("أقبل طلبات الاشتراك").click();
  await page.getByRole("checkbox", { name: "يومي" }).check();
  await page.getByRole("checkbox", { name: "شهري" }).check();
  await page.getByRole("checkbox", { name: "غداء" }).check();
  await page.getByRole("checkbox", { name: "مع التوصيل" }).check();
  await page.getByRole("button", { name: "حفظ الاشتراكات" }).click();
  await expect(page.getByText(/تم الحفظ ✓ أسرتك تظهر الآن/)).toBeVisible();
  expect(saved).toEqual({
    enabled: true,
    daily: true,
    weekly: false,
    monthly: true,
    period: false,
    meals: ["lunch"],
    delivery: true,
    notes: "",
  });
  const requests = page.getByRole("region", { name: "طلبات الاشتراك" });
  await expect(requests).toContainText("سالم");
  await expect(requests).toContainText("أسبوعي");
  await expect(
    requests.getByRole("link", { name: "المحادثة للاتفاق ←" }),
  ).toHaveAttribute("href", "/messages?c=conv-9");
  // قائمة الأطباق لكل وجبة، وجدول الغد، و«تم الاتفاق».
  const menu = page.getByRole("region", { name: "قائمة أطباق الاشتراك" });
  await expect(menu).toContainText("فول، عدس، بيض مسلوق مع الخبز");
  await expect(menu).toContainText("كبسة رز مع لحم");
  let added: unknown;
  await page.route("**/api/producer/subscriptions/menu", (r) => {
    added = r.request().postDataJSON();
    return r.fulfill({ json: [] });
  });
  await menu.getByLabel("طبق عشاء جديد").fill("مرقوق لحم");
  await menu.getByRole("button", { name: "إضافة لـعشاء" }).click();
  await expect.poll(() => added).toEqual({ meal: "dinner", name: "مرقوق لحم" });
  await expect(page.getByRole("region", { name: "جدول الغد" })).toContainText(
    "سالم · غداء: كبسة رز مع لحم · توصيل",
  );
  let decided: unknown;
  await page.route("**/api/producer/subscriptions/decide", (r) => {
    decided = r.request().postDataJSON();
    return r.fulfill({ json: {} });
  });
  await expect(requests).toContainText("ضغط العميل «تم الاتفاق مع الأسرة»");
  await requests.getByRole("button", { name: "أوافق على الاتفاق" }).click();
  await expect.poll(() => decided).toEqual({ id: "r1", status: "agreed" });
});

// «اشتراكاتي»: بعد الاتفاق يختار العميل طبقه الدائم لكل وجبة، ويغيّر طبق يوم قادم.
test("the customer picks a default dish per meal and changes one coming day", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "c",
          name: "سالم",
          phone: "+966500000055",
          role: "customer",
        },
        registrationOpen: true,
      },
    }),
  );
  const view = {
    today: "2099-01-01",
    firstEditable: "2099-01-02",
    subscriptions: [
      {
        id: "s1",
        familyName: "أكلات نجدية",
        slug: "najdi",
        plan: "weekly",
        startDate: "2099-01-01",
        endDate: "2099-01-07",
        days: null,
        meals: ["lunch"],
        delivery: true,
        status: "agreed",
        conversationId: "conv-1",
        customerAgreedAt: "2099-01-01T08:00:00.000Z",
        contractId: "k1",
        defaults: {},
        overrides: [],
        menu: [
          { id: "k", meal: "lunch", name: "كبسة رز مع لحم" },
          { id: "m", meal: "lunch", name: "مرقوق" },
        ],
        itemNames: {},
        upcoming: ["2099-01-02", "2099-01-03"],
      },
    ],
  };
  const sent: unknown[] = [];
  await page.route("**/api/subscriptions/mine", (r) => {
    if (r.request().method() === "PUT") sent.push(r.request().postDataJSON());
    return r.fulfill({ json: view });
  });
  await page.goto("/my-subscriptions");
  await expect(
    page.getByRole("heading", { level: 1, name: "اشتراكاتي" }),
  ).toBeVisible();
  const card = page.getByRole("region", { name: "اشتراك أكلات نجدية" });
  await card
    .getByRole("combobox", { name: "غداء", exact: true })
    .selectOption("k");
  await expect(page.getByText("تم حفظ طبق غداء الدائم ✓")).toBeVisible();
  const day = card.locator("select").nth(1);
  await day.selectOption("m");
  expect(sent).toEqual([
    { kind: "default", id: "s1", meal: "lunch", itemId: "k" },
    { kind: "day", id: "s1", day: "2099-01-02", meal: "lunch", itemId: "m" },
  ]);
  await expect(card).toContainText("لا يُعدَّل");
  await expect(
    card.getByRole("link", { name: "عقد الاشتراك ←" }),
  ).toHaveAttribute("href", "/contracts/k1");
});

// العميل يضغط «تم الاتفاق مع الأسرة» ثم يرى العقد الثابت بعد موافقة الأسرة.
test("the customer agrees, then views the locked subscription contract", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "c",
          name: "سالم",
          phone: "+966500000055",
          role: "customer",
        },
        registrationOpen: true,
      },
    }),
  );
  const sub = {
    id: "s1",
    familyName: "أكلات نجدية",
    slug: "najdi",
    plan: "weekly",
    startDate: "2099-01-01",
    endDate: "2099-01-07",
    days: null,
    meals: ["lunch"],
    delivery: true,
    status: "new",
    conversationId: "conv-1",
    customerAgreedAt: null as string | null,
    contractId: null,
    defaults: {},
    overrides: [],
    menu: [],
    itemNames: {},
    upcoming: [],
  };
  const view = () => ({
    today: "2099-01-01",
    firstEditable: "2099-01-02",
    subscriptions: [sub],
  });
  await page.route("**/api/subscriptions/mine", (r) =>
    r.fulfill({ json: view() }),
  );
  let agreed: unknown;
  await page.route("**/api/subscriptions/agree", (r) => {
    agreed = r.request().postDataJSON();
    sub.customerAgreedAt = "2099-01-01T08:00:00.000Z";
    return r.fulfill({ json: view() });
  });
  await page.goto("/my-subscriptions");
  const card = page.getByRole("region", { name: "اشتراك أكلات نجدية" });
  await card.getByRole("button", { name: "تم الاتفاق مع الأسرة" }).click();
  await expect.poll(() => agreed).toEqual({ id: "s1" });
  await expect(card).toContainText("بانتظار موافقة الأسرة");
  await expect(
    card.getByRole("button", { name: "تم الاتفاق مع الأسرة" }),
  ).toHaveCount(0);

  await page.route("**/api/subscriptions/contracts/k1", (r) =>
    r.fulfill({
      json: {
        contract: {
          id: "k1",
          number: 7,
          familyName: "أكلات نجدية",
          customerName: "سالم",
          terms: {
            plan: "weekly",
            planLabel: "أسبوعي",
            startDate: "2099-01-01",
            endDate: "2099-01-07",
            days: null,
            mealLabels: ["غداء"],
            delivery: true,
            location: "حي النرجس",
            notes: "",
          },
          transcript: [
            {
              side: "customer",
              sender: "سالم",
              body: "طلب اشتراك جديد",
              at: "2099-01-01T07:00:00.000Z",
            },
            {
              side: "family",
              sender: "أكلات نجدية",
              body: "موافقين، الغداء الساعة ١",
              at: "2099-01-01T07:30:00.000Z",
            },
          ],
          customerAgreedAt: "2099-01-01T08:00:00.000Z",
          familyAgreedAt: "2099-01-01T09:00:00.000Z",
          contentHash: "a".repeat(64),
        },
      },
    }),
  );
  await page.goto("/contracts/k1");
  const contract = page.getByRole("article", { name: "عقد الاشتراك" });
  await expect(
    contract.getByRole("heading", { level: 1, name: "عقد اشتراك رقم 7" }),
  ).toBeVisible();
  await expect(contract).toContainText("لا يمكن تعديله ولا حذفه");
  await expect(contract).toContainText("توصيل إلى: حي النرجس");
  await expect(contract).toContainText("موافقين، الغداء الساعة ١");
  await expect(contract).toContainText("a".repeat(64));
  await expect(
    contract.getByRole("button", { name: "طباعة العقد" }),
  ).toBeVisible();
  // لا أزرار تعديل أو حذف في العقد.
  await expect(contract.getByRole("button", { name: /تعديل|حذف/ })).toHaveCount(
    0,
  );
});

// الإدارة ← «عقود الاشتراكات»: قائمة العقود الثابتة ولكل عقد صفحته.
test("the admin sees subscription contracts in their own tab", async ({
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
  await page.route("**/api/admin/producers", (r) =>
    r.fulfill({ json: { producers: [] } }),
  );
  await page.route("**/api/admin/contracts", (r) =>
    r.fulfill({
      json: {
        contracts: [
          {
            id: "k1",
            number: 7,
            familyName: "أكلات نجدية",
            customerName: "سالم",
            plan: "أسبوعي",
            startDate: "2099-01-01",
            familyAgreedAt: "2099-01-01T09:00:00.000Z",
          },
        ],
      },
    }),
  );
  // كل قسم بمساره في القائمة الجانبية (src/lib/admin-nav.ts).
  await page.goto("/admin/contracts");
  const list = page.getByRole("region", { name: "عقود الاشتراكات" });
  await expect(list).toContainText("عقد رقم 7");
  await expect(list).toContainText("أكلات نجدية ← سالم");
  await expect(list).toContainText("لا تُعدَّل ولا تُحذف");
  await expect(list.getByRole("link", { name: "عرض العقد ←" })).toHaveAttribute(
    "href",
    "/admin/contracts/k1",
  );
});
