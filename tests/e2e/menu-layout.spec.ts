import { test, expect } from "@playwright/test";

/**
 * «ترتيب القوائم» (من «أي خدمة»): المدير الكامل يرتّب المجموعات والصفحات بالسهمين، وينقل صفحة
 * لمجموعة أخرى، ويخفي صفحة، ثم يحفظ فتتغير القائمة الجانبية فورًا.
 */
test("the owner reorders the admin menu and the sidebar follows at once", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "a",
          name: "المدير",
          phone: "+966500000009",
          role: "admin",
        },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/admin/producers/pending", (r) =>
    r.fulfill({ json: { count: 0 } }),
  );
  let saved: Record<string, unknown> | null = null;
  await page.route("**/api/admin/menu-layout", async (r) => {
    if (r.request().method() === "PUT") {
      saved = r.request().postDataJSON();
      return r.fulfill({ json: { layout: saved } });
    }
    return r.fulfill({ json: { layout: saved } });
  });
  page.on("dialog", (d) => d.accept());
  await page.goto("/admin/menu-layout");
  const main = page.locator("main");
  await expect(
    main.getByRole("region", { name: "مجموعة التقارير" }),
  ).toBeVisible();
  // «التقارير» للأعلى فتصير الأولى، و«الطلبات» تنتقل إليها، و«الاقتراحات» تُخفى.
  await main.getByRole("button", { name: "المجموعة التقارير للأعلى" }).click();
  await main
    .getByRole("combobox", { name: "نقل الطلبات إلى" })
    .selectOption({ label: "التقارير" });
  await main.getByRole("button", { name: "إخفاء الاقتراحات" }).click();
  await main
    .getByRole("textbox", { name: "اسم المجموعة" })
    .first()
    .fill("تقارير ومتابعة");
  // لوحة التحكم وهذه الصفحة لا تُخفيان.
  await expect(
    main.getByRole("button", { name: "إخفاء لوحة التحكم" }),
  ).toBeDisabled();
  await main.getByRole("button", { name: "حفظ الترتيب" }).click();
  await expect(main.getByTestId("menu-layout-msg")).toContainText("تم الحفظ");
  const body = saved as unknown as {
    groups: { key: string; title: string | null; items: string[] }[];
    hidden: string[];
  };
  expect(body.groups[0]).toEqual({
    key: "التقارير",
    title: "تقارير ومتابعة",
    items: [
      "/admin/security",
      "/admin/backups",
      "/admin/activity",
      "/admin/orders",
    ],
  });
  expect(body.hidden).toEqual(["/admin/suggestions"]);
  // القائمة الجانبية تتبع الترتيب الجديد بلا تحديث للصفحة.
  if ((page.viewportSize()?.width ?? 1280) < 1024)
    await page.getByRole("button", { name: "أقسام الإدارة" }).click();
  const menu = page.getByRole("complementary", { name: "أقسام الإدارة" });
  const groups = menu.locator("[role=group]");
  await expect(groups.first()).toHaveAccessibleName("تقارير ومتابعة");
  await expect(groups.first().getByRole("link")).toHaveText([
    "التقرير الأمني",
    "النسخ الاحتياطية",
    "سجل النشاطات",
    "الطلبات",
  ]);
  await expect(menu.getByRole("link", { name: "الاقتراحات" })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("a supervisor cannot open the menu ordering page", async ({ page }) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "s",
          name: "مشرف",
          phone: "+966500000010",
          role: "customer",
          permissions: ["orders"],
        },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/admin/menu-layout", (r) =>
    r.fulfill({ json: { layout: null } }),
  );
  await page.goto("/admin/menu-layout");
  await expect(page.locator("main")).toContainText(
    "ترتيب القوائم للمدير الكامل فقط",
  );
});
