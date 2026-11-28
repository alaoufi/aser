import { test, expect, type Page } from "@playwright/test";

async function as(page: Page, user: Record<string, unknown>) {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user, registrationOpen: true } }),
  );
  await page.route("**/api/admin/summary", (r) =>
    r.fulfill({ json: { summary: {} } }),
  );
  await page.route("**/api/admin/producers", (r) =>
    r.fulfill({ json: { producers: [] } }),
  );
  await page.route("**/api/admin/orders**", (r) =>
    r.fulfill({ json: { orders: [] } }),
  );
}

test("admin adds a member and grants permissions to members and families", async ({
  page,
}) => {
  await as(page, {
    id: "a",
    name: "المدير",
    phone: "+966500000009",
    role: "admin",
  });
  const members = [
    {
      id: "a",
      name: "المدير",
      phone: "+966500000009",
      role: "admin",
      permissions: [],
      suspended: false,
      familyName: null,
    },
    {
      id: "m",
      name: "سارة",
      phone: "+966500000010",
      role: "customer",
      permissions: [],
      suspended: false,
      familyName: null,
    },
    {
      id: "f",
      name: "أم محمد",
      phone: "+966500000011",
      role: "producer",
      permissions: [],
      suspended: false,
      familyName: "مطبخ أم محمد",
    },
  ];
  const sent: unknown[] = [];
  const tabs: string[] = [];
  await page.route("**/api/admin/members**", async (r) => {
    if (r.request().method() === "PATCH") {
      sent.push(r.request().postDataJSON());
      return r.fulfill({ json: { ok: true } });
    }
    tabs.push(new URL(r.request().url()).searchParams.get("tab") ?? "all");
    return r.fulfill({
      json: {
        members,
        counts: {
          all: 3,
          new: 1,
          suspended: 0,
          families: 1,
          customers: 1,
          admins: 1,
        },
      },
    });
  });
  await page.goto("/admin/members");
  // التبويبات بعددها (قرار المالك 2026-11-28).
  const tablist = page.getByRole("tablist", { name: "تبويبات الأعضاء" });
  await expect(tablist.getByRole("tab")).toHaveText([
    "الكل (3)",
    "＋ إضافة مستخدم",
    "المسجلون خلال 24 ساعة (1)",
    "الموقوفون (0)",
    "الأسر المنتجة (1)",
    "العملاء (1)",
    "الإدارة (1)",
  ]);
  // سطر لكل عضو: الاسم والرقم ونوع الحساب.
  const row = (id: string) => page.locator(`#member-row-${id}`);
  await expect(row("f")).toContainText("أم محمد");
  await expect(row("f")).toContainText("رقم العضو");
  await expect(row("f")).toContainText("أسرة منتجة");
  await expect(row("m")).toContainText("عميل");
  await expect(row("a")).toContainText("مدير عام");
  await tablist.getByRole("tab", { name: /الأسر المنتجة/ }).click();
  await expect.poll(() => tabs.at(-1)).toBe("families");
  await tablist.getByRole("tab", { name: /الكل/ }).click();
  // إضافة عضو جديد برقم جواله وصلاحيات محددة.
  await tablist.getByRole("tab", { name: "＋ إضافة مستخدم" }).click();
  const add = page.getByRole("form", { name: "إضافة عضو" });
  await add.getByLabel("اسم العضو").fill("نورة");
  await add.getByLabel("رقم الجوال").fill("0500000099");
  await add
    .getByRole("radio", { name: "مدير مخصص (أقسام تختارها له)" })
    .check();
  await add.getByRole("checkbox", { name: "الطلبات", exact: true }).check();
  await add.getByRole("button", { name: "إضافة العضو" }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toEqual({
    action: "create",
    name: "نورة",
    phone: "0500000099",
    fullAdmin: false,
    permissions: ["orders"],
  });
  // حساب المدير نفسه لا يُعدَّل ولا يُوقف.
  const menu = async (name: string, item: string) => {
    await page.getByLabel(`خيارات ${name}`).click();
    await page.getByRole("button", { name: item, exact: true }).click();
  };
  await page.getByLabel("خيارات المدير").click();
  await expect(
    row("a").getByRole("button", { name: "إيقاف", exact: true }),
  ).toHaveCount(0);
  await row("a").getByRole("button", { name: "تعديل", exact: true }).click();
  await expect(page.getByText("لا يمكنك تعديل صلاحيات حسابك")).toBeVisible();
  // التفاصيل.
  await menu("سارة", "تفاصيل");
  await expect(row("m").locator(".member-details")).toContainText(
    "+966500000010",
  );
  // عضو عادي يُعطى صلاحيات محددة.
  await menu("سارة", "تعديل");
  await page
    .getByRole("radio", { name: "مدير مخصص (أقسام تختارها له)" })
    .check();
  await page.getByRole("checkbox", { name: "الطلبات", exact: true }).check();
  await page.getByRole("checkbox", { name: "البلاغات", exact: true }).check();
  await page.getByRole("button", { name: "حفظ الصلاحيات" }).click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toEqual({
    action: "access",
    id: "m",
    fullAdmin: false,
    permissions: ["orders", "reports"],
  });
  // الأسرة المنتجة: صلاحيات محددة متاحة، والمدير الكامل غير متاح، ويمكن إيقافها.
  await menu("أم محمد", "تعديل");
  await expect(
    page.getByRole("radio", {
      name: "مدير عام (كل الأقسام والأعضاء والصلاحيات)",
    }),
  ).toBeDisabled();
  await page
    .getByRole("radio", { name: "مدير مخصص (أقسام تختارها له)" })
    .check();
  await page.getByRole("checkbox", { name: "المنتجات", exact: true }).check();
  await page.getByRole("button", { name: "حفظ الصلاحيات" }).click();
  await expect.poll(() => sent.length).toBe(3);
  expect(sent[2]).toEqual({
    action: "access",
    id: "f",
    fullAdmin: false,
    permissions: ["products"],
  });
  // الإيقاف من ⋮ برسالة تأكيد.
  await menu("أم محمد", "إيقاف");
  const confirm = row("f").getByRole("alertdialog");
  await expect(confirm).toContainText("إيقاف حساب «أم محمد»؟");
  await page.screenshot({ path: "test-results/members-rows.png" });
  await confirm.getByRole("button", { name: "نعم، تأكيد" }).click();
  await expect.poll(() => sent.length).toBe(4);
  expect(sent[3]).toEqual({ action: "suspend", id: "f" });
});

test("a family with admin permissions keeps its own account and opens the panel with one tap", async ({
  page,
}) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("jdatna:family-welcome", "1");
    } catch {}
  });
  // الخادم يميّز اللوحة من الصفحة التي طلبت الجلسة (Referer)، فنحاكيه هنا:
  // في الموقع حسابها الشخصي (أسرة) بلا صلاحيات، وفي اللوحة صلاحية الطلبات فقط.
  await as(page, {});
  await page.unroute("**/api/session");
  const family = { id: "s", name: "أم محمد", phone: "+966500000012" };
  await page.route("**/api/session", (r) => {
    const from = new URL(r.request().headers().referer ?? "http://x/").pathname;
    const panel = from === "/admin" || from.startsWith("/admin/");
    return r.fulfill({
      json: {
        user: panel
          ? {
              ...family,
              role: "producer",
              permissions: ["orders", "contracts"],
            }
          : { ...family, role: "producer", permissions: [], adminAccess: true },
        registrationOpen: true,
      },
    });
  });
  await page.route("**/api/producer/status", (r) =>
    r.fulfill({ json: { state: null } }),
  );
  await page.route("**/api/producer/orders**", (r) =>
    r.fulfill({ json: { orders: [], alerts: [], pending: 0 } }),
  );
  let entered = 0;
  await page.route("**/api/auth/admin-session", (r) => {
    entered++;
    return r.fulfill({ json: { ok: true, next: "/admin" } });
  });
  await page.goto("/");
  const mobile = (page.viewportSize()?.width ?? 1280) <= 850;
  if (mobile) await page.locator(".mobile-nav > summary").click();
  const scope = mobile
    ? page.getByRole("navigation", { name: "التنقل للجوال" })
    : page.locator(".site-header .header-actions");
  await expect(scope.getByRole("link", { name: "حسابي" })).toHaveAttribute(
    "href",
    "/dashboard",
  );
  // جلسة اللوحة: قسم الطلبات وعقود الاشتراكات.
  await scope.getByRole("button", { name: "لوحة الإدارة" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  expect(entered).toBe(1);
  const menu = page.getByRole("complementary", { name: "أقسام الإدارة" });
  if (mobile) await page.getByRole("button", { name: "أقسام الإدارة" }).click();
  await expect(menu.getByRole("navigation").getByRole("link")).toHaveText([
    "لوحة التحكم",
    "الطلبات",
    "عقود الاشتراكات",
  ]);
});

test("visitors pick the site look themselves and it is remembered", async ({
  page,
}) => {
  await page.goto("/");
  const initial = await page.locator("html").getAttribute("data-template");
  const mobile = (page.viewportSize()?.width ?? 1280) <= 850;
  if (mobile) await page.locator(".mobile-nav > summary").click();
  const switcher = page
    .getByRole("group", { name: "شكل الموقع" })
    .filter({ visible: true })
    .first();
  const target = initial === "najdi" ? "الكلاسيكي" : "الباب النجدي";
  await switcher.getByRole("button", { name: target }).click();
  const expected = initial === "najdi" ? "classic" : "najdi";
  await expect(page.locator("html")).toHaveAttribute("data-template", expected);
  await page.goto("/about");
  await expect(page.locator("html")).toHaveAttribute("data-template", expected);
  // الطاولة ثلاثية الأبعاد بأرجل قصيرة.
  await page.goto("/");
  await expect(page.locator(".today-table .table-3d .table-leg")).toHaveCount(
    4,
  );
});

// قرار المالك 2026-11-28: مندوب الأسرة يظهر «مندوب خاص»، وفي التفاصيل الأسرة التي يتبعها.
test("a family's private courier is labelled private with its family in the details", async ({
  page,
}) => {
  await as(page, {
    id: "a",
    name: "المدير",
    phone: "+966500000009",
    role: "admin",
  });
  const base = { permissions: [], suspended: false, familyName: null };
  await page.route("**/api/admin/members**", (r) =>
    r.fulfill({
      json: {
        members: [
          {
            ...base,
            id: "k1",
            name: "حسن",
            phone: "+966500000117",
            role: "courier",
            courierStatus: "approved",
            courierFamily: "مطبخ أم محمد",
          },
          {
            ...base,
            id: "k2",
            name: "معاذ",
            phone: "+966500000118",
            role: "courier",
            courierStatus: "approved",
            courierFamily: null,
          },
        ],
        counts: {},
      },
    }),
  );
  await page.goto("/admin/members");
  const row = (id: string) => page.locator(`#member-row-${id}`);
  await expect(row("k1")).toContainText("مندوب خاص");
  await expect(row("k2")).not.toContainText("مندوب خاص");
  await expect(row("k2")).toContainText("مندوب");
  await page.getByLabel("خيارات حسن").click();
  await page.getByRole("button", { name: "تفاصيل", exact: true }).click();
  const details = row("k1").locator(".member-details");
  await expect(details).toContainText("يتبع أسرة");
  await expect(details).toContainText("مطبخ أم محمد");
  await expect(details).toContainText("مندوب خاص");
});
