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
  await page.route("**/api/admin/members**", async (r) => {
    if (r.request().method() === "PATCH") {
      sent.push(r.request().postDataJSON());
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: { members } });
  });
  await page.goto("/admin");
  await page
    .getByRole("button", { name: "الأعضاء والصلاحيات", exact: true })
    .click();
  // إضافة عضو جديد برقم جواله وصلاحيات محددة.
  await page.getByRole("button", { name: "＋ إضافة عضو أو مشرف" }).click();
  const add = page.getByRole("form", { name: "إضافة عضو" });
  await add.getByLabel("اسم العضو").fill("نورة");
  await add.getByLabel("رقم الجوال").fill("0500000099");
  await add.getByRole("radio", { name: "صلاحيات إدارية محددة" }).check();
  await add.getByRole("checkbox", { name: "الطلبات" }).check();
  await add.getByRole("button", { name: "إضافة العضو" }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toEqual({
    action: "create",
    name: "نورة",
    phone: "0500000099",
    fullAdmin: false,
    permissions: ["orders"],
  });
  // حساب المدير نفسه لا يُعدَّل.
  await page.getByRole("button", { name: /المدير \(حسابك\)/ }).click();
  await expect(page.getByText("لا يمكنك تعديل صلاحيات حسابك")).toBeVisible();
  // عضو عادي يُعطى صلاحيات محددة.
  await page.getByRole("button", { name: /سارة/ }).click();
  await page.getByRole("radio", { name: "صلاحيات إدارية محددة" }).check();
  await page.getByRole("checkbox", { name: "الطلبات" }).check();
  await page.getByRole("checkbox", { name: "البلاغات" }).check();
  await page.getByRole("button", { name: "حفظ الصلاحيات" }).click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toEqual({
    action: "access",
    id: "m",
    fullAdmin: false,
    permissions: ["orders", "reports"],
  });
  // الأسرة المنتجة: صلاحيات محددة متاحة، والمدير الكامل غير متاح، ويمكن إيقافها.
  await page.getByRole("button", { name: /أم محمد/ }).click();
  await expect(
    page.getByRole("radio", { name: "مدير كامل (كل الصلاحيات)" }),
  ).toBeDisabled();
  await page.getByRole("radio", { name: "صلاحيات إدارية محددة" }).check();
  await page.getByRole("checkbox", { name: "المنتجات" }).check();
  await page.getByRole("button", { name: "حفظ الصلاحيات" }).click();
  await expect.poll(() => sent.length).toBe(3);
  expect(sent[2]).toEqual({
    action: "access",
    id: "f",
    fullAdmin: false,
    permissions: ["products"],
  });
  await page.getByRole("button", { name: "إيقاف الحساب" }).click();
  await page.getByRole("button", { name: "تأكيد إيقاف أم محمد" }).click();
  await expect.poll(() => sent.length).toBe(4);
  expect(sent[3]).toEqual({ action: "suspend", id: "f" });
});

test("a family with admin permissions keeps its own account and gets an admin account", async ({
  page,
}) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("jdatna:family-welcome", "1");
    } catch {}
  });
  await as(page, {
    id: "s",
    name: "أم محمد",
    phone: "+966500000012",
    role: "producer",
    permissions: ["orders"],
  });
  await page.route("**/api/producer/status", (r) =>
    r.fulfill({ json: { state: null } }),
  );
  await page.route("**/api/producer/orders**", (r) =>
    r.fulfill({ json: { orders: [], alerts: [], pending: 0 } }),
  );
  await page.goto("/");
  const mobile = (page.viewportSize()?.width ?? 1280) <= 850;
  if (mobile) await page.locator(".mobile-nav summary").click();
  const scope = mobile
    ? page.getByRole("navigation", { name: "التنقل للجوال" })
    : page.locator(".site-header .header-actions");
  await expect(
    scope.getByRole("link", { name: "حسابي الخاص" }),
  ).toHaveAttribute("href", "/dashboard");
  await expect(
    scope.getByRole("link", { name: "حساب الإدارة" }),
  ).toHaveAttribute("href", "/admin");
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "أقسام الإدارة" });
  await expect(nav.getByRole("button")).toHaveText(["الطلبات"]);
  await expect(page.getByRole("button", { name: "الطلبات" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("visitors pick the site look themselves and it is remembered", async ({
  page,
}) => {
  await page.goto("/");
  const initial = await page.locator("html").getAttribute("data-template");
  const mobile = (page.viewportSize()?.width ?? 1280) <= 850;
  if (mobile) await page.locator(".mobile-nav summary").click();
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
