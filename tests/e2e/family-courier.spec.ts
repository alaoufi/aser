import { test, expect } from "@playwright/test";

const familySession = {
  user: {
    id: "f",
    name: "أسرة",
    phone: "+966500000041",
    role: "producer",
  },
  registrationOpen: true,
};

// الأسرة تسجّل مندوبها الخاص (الاسم والجوال والسيارة) بتعهّد، دون اعتماد الإدارة، ويظهر بشارة أسرتها.
test("a family registers its own courier with a pledge and sees the private badge", async ({
  page,
}) => {
  // ترحيب الأسرة يُختبر في family-welcome.spec؛ هنا نعدّه ظاهرًا في هذه الزيارة.
  await page.addInitScript(() =>
    sessionStorage.setItem("jdatna:family-welcome", "1"),
  );
  await page.route("**/api/session", (r) => r.fulfill({ json: familySession }));
  await page.route("**/api/producer/profile", (r) =>
    r.fulfill({ json: { cities: [], profile: null } }),
  );
  let couriers: Record<string, unknown>[] = [];
  let posted: Record<string, unknown> | undefined;
  let stopped: Record<string, unknown> | undefined;
  await page.route("**/api/producer/couriers", async (r) => {
    const method = r.request().method();
    if (method === "POST") {
      posted = r.request().postDataJSON();
      couriers = [
        {
          id: "k1",
          userId: "u1",
          name: posted!.name,
          phone: "+966511111111",
          carType:
            posted!.vehicle === "car"
              ? `سيارة ${posted!.carModel} · ${posted!.carColor}`
              : "دباب",
          vehicle: posted!.vehicle,
          // قرار المالك 2026-11-28: ينتظر اعتماد الإدارة.
          status: "pending",
          active: true,
          stoppedByAdmin: false,
          joined: false,
        },
      ];
      return r.fulfill({ json: { id: "k1", status: "pending" } });
    }
    if (method === "PATCH") {
      stopped = r.request().postDataJSON();
      couriers = couriers.map((k) => ({ ...k, status: "suspended" }));
      return r.fulfill({ json: { id: "k1", status: "suspended" } });
    }
    return r.fulfill({
      json: {
        familyName: "مطبخ أم سعد",
        pledge: "أتعهد بأنني أعرف هذا المندوب معرفة شخصية.",
        couriers,
      },
    });
  });
  await page.route("**/api/couriers?*", (r) =>
    r.fulfill({
      json: {
        couriers: couriers.length
          ? [
              {
                id: "k1",
                userId: "u1",
                name: "سالم",
                carType: "سوناتا",
                cityName: "الرياض",
                regionName: "منطقة الرياض",
                phone: null,
                whatsapp: null,
                cityPrice: null,
                centers: [],
                familyName: "مطبخ أم سعد",
              },
            ]
          : [],
      },
    }),
  );
  await page.goto("/couriers");
  const section = page.getByRole("region", { name: "مندوبي الخاص" });
  await expect(section).toBeVisible();
  // بدون تعبئة: رسالة نواقص واضحة تشمل التعهد.
  await section.getByRole("button", { name: "تسجيل المندوب الخاص" }).click();
  const issues = section.getByRole("alert");
  await expect(issues).toContainText("اسم المندوب");
  await expect(issues).toContainText("جوال المندوب");
  await expect(issues).toContainText("التعهد بمعرفة المندوب");
  await expect(issues).toContainText("يلزم الإقرار بالتعهد");
  expect(posted).toBeUndefined();

  await section.getByLabel("اسم المندوب").fill("سالم");
  // التعهد باسم المندوب كما يُكتب (قرار المالك 2026-11-28).
  await expect(section).toContainText(
    "هذا المندوب «سالم» تابع لي وأعرفه، وتحت مسؤوليتي نظاميته وأمانته.",
  );
  await section.getByLabel("جوال المندوب").fill("0511111111");
  await section.getByLabel("الجنسية").selectOption("سعودي");
  // المركبة: سيارة (نوعها ولونها) أو دباب (بلا نوع ولون).
  await section.getByLabel("🛵 دباب").check();
  await expect(section.getByLabel("نوع السيارة")).toHaveCount(0);
  await section.getByLabel("🚗 سيارة").check();
  await section.getByLabel("نوع السيارة").fill("سوناتا");
  await section.getByLabel("لون السيارة").fill("أبيض");
  // الضغط على نص التعهد يحدد الخانة.
  await section.getByText("تابع لي وأعرفه").click();
  await section.getByRole("button", { name: "تسجيل المندوب الخاص" }).click();
  await expect(section.getByText("تم تسجيل المندوب ✓")).toContainText(
    "يُفعَّل بعد موافقتها",
  );
  expect(posted).toEqual({
    name: "سالم",
    phone: "0511111111",
    nationality: "سعودي",
    vehicle: "car",
    carModel: "سوناتا",
    carColor: "أبيض",
    pledge: true,
  });
  await expect(section).toContainText("🚗 سيارة سوناتا · أبيض");
  const card = section.getByRole("listitem").filter({ hasText: "سالم" });
  await expect(card.getByText("مندوب خاص لـ مطبخ أم سعد")).toBeVisible();
  await expect(card).toContainText("بانتظار اعتماد الإدارة");

  // الإيقاف بتأكيد.
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "إيقاف المندوب" }).click();
  await expect(section.getByText("تم إيقاف المندوب")).toBeVisible();
  expect(stopped).toEqual({ id: "k1" });
});

// المندوب الخاص يرى في لوحته شارة أسرته، ولا يظهر له نموذج الهوية الخاص بالمندوب العام.
test("a private courier sees its family badge and no ID form", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "k",
          name: "سالم",
          phone: "+966511111111",
          role: "courier",
        },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/courier/profile", (r) =>
    r.fulfill({
      json: {
        courier: {
          id: "k1",
          name: "سالم",
          cityId: "riyadh-city",
          regionId: "riyadh",
          carType: "سوناتا",
          documentId: null,
          nationalId: "",
          showPhone: true,
          showWhatsapp: true,
          status: "approved",
          reviewReason: null,
          active: true,
          cityPrice: null,
          centers: [],
          familyName: "مطبخ أم سعد",
        },
        cities: [],
        centers: [],
      },
    }),
  );
  await page.route("**/api/courier/deliveries", (r) =>
    r.fulfill({ json: { deliveries: [] } }),
  );
  await page.goto("/courier");
  await expect(page.getByText("مندوب خاص لـ مطبخ أم سعد")).toBeVisible();
  await expect(
    page.getByText(/سجّلتك «مطبخ أم سعد» مندوبًا خاصًا/),
  ).toBeVisible();
  await expect(page.getByLabel("رقم الهوية")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "بيانات المندوب" }),
  ).toHaveCount(0);
});

// صاحب الحساب واضح: «مرحبًا، اسم الأسرة» أعلى صفحات الحساب وأعلى قائمة الجوال،
// و«مندوبي الخاص» مربع في لوحة الأسرة يفتح صفحته.
test("the family sees its own name on top and a «my private courier» tile", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("jdatna:family-welcome", "1"),
  );
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          ...familySession.user,
          name: "سعود",
          familyName: "أكلات نجدية",
        },
        registrationOpen: true,
      },
    }),
  );
  // بيانات لوحة الأسرة كاملة كما يردها الخادم (الأقسام والمدن).
  await page.route("**/api/producer/profile", (r) =>
    r.fulfill({ json: { cities: [], categories: [], profile: null } }),
  );
  await page.route("**/api/producer/couriers", (r) =>
    r.fulfill({
      json: { familyName: "أكلات نجدية", pledge: "أتعهد.", couriers: [] },
    }),
  );
  await page.goto("/dashboard");
  const greeting = page.locator("main").getByText(/مرحبًا، أكلات نجدية/);
  await expect(greeting).toBeVisible();
  await expect(page.locator("main")).toContainText("أسرة منتجة");
  const tile = page
    .getByRole("navigation", { name: "أقسام الأسرة المنتجة" })
    .getByRole("link", { name: "مندوبي الخاص" });
  await expect(tile).toHaveAttribute("href", "/dashboard/couriers");
  await page.goto("/dashboard/couriers");
  await expect(
    page.getByRole("heading", { level: 1, name: "مندوبي الخاص" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "مندوبي الخاص" }),
  ).toBeVisible();
});

test("the mobile menu greets the family by name at the top", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "قائمة الجوال");
  await page.addInitScript(() =>
    sessionStorage.setItem("jdatna:family-welcome", "1"),
  );
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: { ...familySession.user, familyName: "أكلات نجدية" },
        registrationOpen: true,
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("قائمة التنقل").click();
  await expect(
    page
      .getByRole("navigation", { name: "التنقل للجوال" })
      .locator(".menu-greeting"),
  ).toContainText("مرحبًا، أكلات نجدية");
  await expect(
    page
      .getByRole("navigation", { name: "التنقل للجوال" })
      .locator(".menu-greeting small"),
  ).toHaveText("حساب أسرة منتجة");
  await expect(
    page
      .getByRole("navigation", { name: "التنقل للجوال" })
      .getByRole("link", { name: "مندوبي الخاص" }),
  ).toHaveAttribute("href", "/dashboard/couriers");
});

// مشاركة حساب الأسرة أعلى لوحتها: رابط مختصر لصفحتها العامة بكل منتجاتها.
test("the family dashboard shares the family page from the top", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("jdatna:family-welcome", "1"),
  );
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: { ...familySession.user, familyName: "أكلات نجدية" },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/producer/profile", (r) =>
    r.fulfill({ json: { cities: [], categories: [], profile: null } }),
  );
  await page.route("**/api/producer/status", (r) =>
    r.fulfill({ json: { state: null, slug: "akalat-najdia" } }),
  );
  await page.route("**/api/share?family=akalat-najdia", (r) =>
    r.fulfill({ json: { url: "https://jdatna.com/s/Nj7dQa" } }),
  );
  await page.goto("/dashboard");
  await expect(
    page.getByRole("link", { name: "صفحة أسرتي ومنتجاتها ←" }),
  ).toHaveAttribute("href", "/producers/akalat-najdia");
  const menu = page.locator("main .share-menu");
  await menu.locator("summary").click();
  await expect(menu.locator(".share-link")).toHaveText("jdatna.com/s/Nj7dQa");
  await expect(menu.getByRole("link", { name: "واتساب" })).toHaveAttribute(
    "href",
    /wa\.me\/\?text=.*jdatna\.com%2Fs%2FNj7dQa/,
  );
});

// المدير الكامل الذي له أسرة: حسابه الشخصي حساب أسرة، فيرى «مندوبي الخاص» في القائمة واللوحة،
// و«حسابي» يفتح لوحة الأسرة، ونوع الحساب تحت الاسم مباشرة.
test("an admin who owns a family sees the family sections and «my private courier»", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("jdatna:family-welcome", "1"),
  );
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "a",
          name: "المالك",
          phone: "+966500000099",
          // في الموقع: حسابه الشخصي حساب أسرة، بلا صلاحيات (الإدارة بجلسة مستقلة).
          role: "producer",
          permissions: [],
          adminAccess: true,
          familyName: "أكلات نجدية",
        },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/producer/profile", (r) =>
    r.fulfill({ json: { cities: [], categories: [], profile: null } }),
  );
  await page.goto("/dashboard");
  const greeting = page
    .locator("main p")
    .filter({ hasText: "مرحبًا، أكلات نجدية" });
  await expect(greeting).toBeVisible();
  await expect(greeting.locator("+ p")).toHaveText("حساب أسرة منتجة");
  await page
    .getByRole("navigation", { name: "حسابي" })
    .getByText("قائمة حسابي")
    .click();
  await expect(
    page.getByRole("navigation", { name: "حسابي" }).getByRole("link", {
      name: "مندوبي الخاص",
    }),
  ).toHaveAttribute("href", "/dashboard/couriers");
  await expect(
    page
      .getByRole("navigation", { name: "أقسام الأسرة المنتجة" })
      .getByRole("link", { name: "مندوبي الخاص" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("link", { name: "حسابي", exact: true, includeHidden: true })
      .first(),
  ).toHaveAttribute("href", "/dashboard");
});

test("account type is written under the name: customer and courier", async ({
  page,
}) => {
  for (const [role, kind] of [
    ["customer", "حساب عميل"],
    ["courier", "حساب مندوب"],
  ] as const) {
    await page.route("**/api/session", (r) =>
      r.fulfill({
        json: {
          user: { id: "u", name: "سالم", phone: "+966500000077", role },
          registrationOpen: true,
        },
      }),
    );
    await page.goto("/me");
    const greeting = page.locator("main p").filter({ hasText: "مرحبًا، سالم" });
    await expect(greeting.locator("+ p")).toHaveText(kind);
    await page.unroute("**/api/session");
  }
});

// اللوحة منفصلة عن الحساب الشخصي: إطار خاص بلا ترويسة الموقع وروابط الحساب، و«الموقع» يعيد إليه.
test("admin panel and personal account stay separate, with a way back to the site", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("jdatna:family-welcome", "1"),
  );
  const owner = {
    id: "a",
    name: "المالك",
    phone: "+966500000099",
    familyName: "أكلات نجدية",
  };
  // الخادم يميّز اللوحة من الصفحة؛ هنا نحاكيه بمسار الصفحة التي طلبت الجلسة.
  await page.route("**/api/session", (r) => {
    const from = new URL(r.request().headers().referer ?? "http://x/").pathname;
    const panel = from === "/admin" || from.startsWith("/admin/");
    return r.fulfill({
      json: {
        user: panel
          ? { ...owner, role: "admin", permissions: [] }
          : { ...owner, role: "producer", permissions: [], adminAccess: true },
        registrationOpen: true,
      },
    });
  });
  await page.route("**/api/producer/profile", (r) =>
    r.fulfill({ json: { cities: [], categories: [], profile: null } }),
  );
  await page.route("**/api/admin/summary", (r) =>
    r.fulfill({ json: { summary: {} } }),
  );
  await page.route("**/api/admin/producers**", (r) =>
    r.fulfill({ json: { producers: [], count: 0 } }),
  );
  await page.goto("/dashboard");
  await expect(
    page.locator("main").getByRole("link", { name: /لوحة الإدارة/ }),
  ).toHaveCount(0);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { level: 1, name: "لوحة التحكم" }),
  ).toBeVisible();
  // لا ترويسة الموقع ولا روابط الحساب الشخصي داخل اللوحة.
  await expect(page.locator("header.site-header")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "حسابي", exact: true }),
  ).toHaveCount(0);
  // على الجوال القائمة تُفتح بزر ☰.
  if ((page.viewportSize()?.width ?? 1280) < 1024)
    await page.getByRole("button", { name: "أقسام الإدارة" }).click();
  await expect(
    page
      .getByRole("complementary", { name: "أقسام الإدارة" })
      .getByRole("link", { name: "الموقع", exact: true }),
  ).toHaveAttribute("href", "/");
});

// أسرة لم تُعتمد بعد: يُشرح لها متى تضيف مندوبها بدل إخفاء القسم.
test("a family not yet approved is told it adds its private courier after approval", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("jdatna:family-welcome", "1"),
  );
  await page.route("**/api/session", (r) => r.fulfill({ json: familySession }));
  await page.route("**/api/producer/couriers", (r) =>
    r.fulfill({
      status: 403,
      json: { error: "المندوب الخاص للأسر المنتجة المعتمدة فقط" },
    }),
  );
  await page.goto("/dashboard/couriers");
  const section = page.getByRole("region", { name: "مندوبي الخاص" });
  await expect(section).toContainText("للأسر المنتجة المعتمدة فقط");
  await expect(section).toContainText("بعد اعتماد أسرتك");
});
