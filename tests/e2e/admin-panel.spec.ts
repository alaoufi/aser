import { test, expect, type Page } from "@playwright/test";

/**
 * «لوحة الإدارة» مثل «أي خدمة» (قرار المالك 2026-11-21):
 * - في الموقع: صاحب الصلاحيات عضو كغيره، ويرى «لوحة الإدارة» في قائمة حسابه فقط.
 * - الضغط عليها يفتح جلسة مستقلة ثم اللوحة: قائمة جانبية يمين بمجموعات، بلا ترويسة الموقع وتذييله.
 * - على الجوال: القائمة تُفتح بزر ☰ وتُغلق بـ Esc أو بالضغط خارجها.
 * - «خروج من اللوحة» يغلق جلسة الإدارة ويعيد للموقع بالحساب الشخصي.
 */
const person = {
  id: "a",
  name: "مدير الاختبار",
  phone: "+966500000009",
  role: "customer",
  permissions: [],
  adminAccess: true,
};
const admin = { ...person, role: "admin", adminAccess: undefined };

async function mock(page: Page) {
  let panelOpen = false;
  const calls: string[] = [];
  // الخادم يميّز اللوحة من الصفحة (Referer)؛ هنا نحاكيه من مسار الصفحة.
  await page.route("**/api/session", (r) => {
    const from = r.request().headers().referer ?? "";
    const inPanel = /\/admin(\/|$|\?)/.test(
      new URL(from || "http://x/").pathname,
    );
    return r.fulfill({
      json: {
        user: inPanel ? (panelOpen ? admin : null) : person,
        registrationOpen: true,
      },
    });
  });
  await page.route("**/api/auth/admin-session", (r) => {
    calls.push("enter");
    panelOpen = true;
    return r.fulfill({ json: { ok: true, next: "/admin" } });
  });
  await page.route("**/api/logout", (r) => {
    calls.push("logout");
    panelOpen = false;
    return r.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/admin/summary", (r) =>
    r.fulfill({
      json: {
        summary: {
          familiesPending: 2,
          familiesIncomplete: 0,
          familiesApproved: 5,
          ordersToday: 1,
          ordersStale: 0,
          productsLive: 9,
          reportsOpen: 0,
        },
      },
    }),
  );
  await page.route("**/api/admin/producers/pending", (r) =>
    r.fulfill({ json: { count: 2 } }),
  );
  await page.route("**/api/admin/producers", (r) =>
    r.fulfill({ json: { producers: [] } }),
  );
  await page.route("**/api/admin/orders", (r) =>
    r.fulfill({ json: { orders: [] } }),
  );
  return calls;
}

test("one tap opens the separate panel with a right sidebar, and leaving returns to the personal site", async ({
  page,
  isMobile,
}) => {
  const calls = await mock(page);
  await page.goto("/");
  // الموقع شخصي: «حسابي» و«لوحة الإدارة» فقط، بلا تنبيهات إدارية.
  const open = isMobile
    ? page.locator(".mobile-nav").getByTestId("open-admin-panel")
    : page.locator("header .header-actions").getByTestId("open-admin-panel");
  if (isMobile) await page.locator(".mobile-nav > summary").click();
  await expect(open).toHaveText("لوحة الإدارة");
  await open.click();
  await expect(page).toHaveURL(/\/admin$/);
  expect(calls).toContain("enter");

  // اللوحة: بلا ترويسة الموقع وتذييله، وعنوانها «لوحة التحكم».
  await expect(page.locator("header.site-header")).toHaveCount(0);
  await expect(page.locator("footer.site-footer")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 1, name: "لوحة التحكم" }),
  ).toBeVisible();
  const menu = page.getByRole("complementary", { name: "أقسام الإدارة" });
  if (isMobile) {
    await expect(menu).toBeHidden();
    await page.getByRole("button", { name: "أقسام الإدارة" }).click();
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await page.getByRole("button", { name: "أقسام الإدارة" }).click();
  }
  await expect(menu).toBeVisible();
  // القائمة في جهة البداية (يمين بالعربية).
  const box = await menu.boundingBox();
  const width = page.viewportSize()!.width;
  expect(box!.x + box!.width).toBeGreaterThan(width - 2);
  for (const group of [
    "نظرة عامة",
    "التقارير",
    "الأسر والأعضاء",
    "الطلبات والمتابعة",
    "المنتجات والأقسام",
    "الأماكن",
    "إعدادات الموقع",
  ])
    await expect(menu.getByRole("group", { name: group })).toBeVisible();
  // عدد «تنتظر الاعتماد» بجانب قسمه.
  await expect(
    menu.getByRole("link", { name: /اعتماد الأسر والمندوبين\s*2/ }),
  ).toBeVisible();
  // القسم يفتح بمساره، والعنوان يتبعه.
  await menu.getByRole("link", { name: "الطلبات" }).click();
  await expect(page).toHaveURL(/\/admin\/orders$/);
  await expect(page.locator("header strong")).toHaveText("الطلبات");
  if (isMobile) await expect(menu).toBeHidden();

  // الخروج من اللوحة: الموقع يعود بالحساب الشخصي.
  if (isMobile)
    await page.getByRole("button", { name: "أقسام الإدارة" }).click();
  await menu.getByRole("button", { name: "خروج من اللوحة" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(calls).toContain("logout");
  await expect(page.locator("header.site-header")).toBeVisible();
});

test("without a panel session, /admin asks for one tap and never shows the site header", async ({
  page,
}) => {
  const calls = await mock(page);
  await page.goto("/admin/orders");
  await expect(
    page.getByRole("heading", { level: 1, name: "لوحة الإدارة" }),
  ).toBeVisible();
  await expect(page.locator("header.site-header")).toHaveCount(0);
  await page.getByRole("button", { name: "افتح لوحة الإدارة" }).click();
  // اللوحة فُتحت: رأسها باسم القسم.
  await expect(page.locator("header strong")).toHaveText("الطلبات");
  expect(calls).toEqual(["enter"]);
  await expect(page).toHaveURL(/\/admin\/orders$/);
});

test("old ?tab= links open the section at its new path", async ({ page }) => {
  await mock(page);
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: admin, registrationOpen: true } }),
  );
  await page.goto("/admin?tab=approvals");
  await expect(page).toHaveURL(/\/admin\/approvals$/);
  await expect(
    page.getByRole("heading", { name: "اعتماد الأسر المنتجة" }),
  ).toBeVisible();
});
