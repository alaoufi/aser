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

test("admin grants a member limited moderator permissions and can suspend", async ({
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
  // حساب المدير نفسه لا يُعدَّل.
  await page.getByRole("button", { name: /المدير \(حسابك\)/ }).click();
  await expect(page.getByText("لا يمكنك تعديل صلاحيات حسابك")).toBeVisible();
  await page.getByRole("button", { name: /سارة/ }).click();
  await page.getByLabel("الدور").selectOption("staff");
  await page.getByRole("checkbox", { name: "الطلبات" }).check();
  await page.getByRole("checkbox", { name: "البلاغات" }).check();
  await page.getByRole("button", { name: "حفظ الصلاحيات" }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toEqual({
    action: "role",
    id: "m",
    role: "staff",
    permissions: ["orders", "reports"],
  });
  // الأسرة المنتجة: إيقاف فقط، بلا تغيير دور.
  await page.getByRole("button", { name: /أم محمد/ }).click();
  await expect(page.getByText("دوره يُدار من مراجعة الأسر")).toBeVisible();
  await page.getByRole("button", { name: "إيقاف الحساب" }).click();
  await page.getByRole("button", { name: "تأكيد إيقاف أم محمد" }).click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toEqual({ action: "suspend", id: "f" });
});

test("a moderator sees only the admin sections granted to them", async ({
  page,
}) => {
  await as(page, {
    id: "s",
    name: "مشرف",
    phone: "+966500000012",
    role: "staff",
    permissions: ["orders"],
  });
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "أقسام الإدارة" });
  await expect(nav.getByRole("button")).toHaveText(["الطلبات"]);
  await expect(
    nav.getByRole("link", { name: "إدارة التغطية التفصيلية" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "الطلبات" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("الهوية الوطنية ليست ترخيصًا")).toHaveCount(0);
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
