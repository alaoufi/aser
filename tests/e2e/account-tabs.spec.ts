import { test, expect, type Page } from "@playwright/test";

async function family(page: Page) {
  await page.addInitScript(() =>
    sessionStorage.setItem("jdatna:family-welcome", "1"),
  );
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "f",
          name: "أم سالم",
          phone: "+966500000041",
          role: "producer",
          familyName: "أكلات نجدية",
        },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/producer/**", (r) =>
    r.fulfill({ json: { orders: [], products: [], categories: [] } }),
  );
}

test("the family dashboard sections are 3D tabs, and the current one is marked", async ({
  page,
}) => {
  await family(page);
  await page.goto("/dashboard/orders");
  const tabs = page.getByRole("navigation", { name: "أقسام الأسرة المنتجة" });
  await expect(tabs.getByRole("link")).toHaveText([
    "الرئيسية",
    "المنتجات",
    "الطلبات",
    "العروض",
    "الاشتراكات",
    "مكتبة الصور",
    "التغطية",
    "مندوبي الخاص",
  ]);
  const current = tabs.getByRole("link", { name: "الطلبات" });
  await expect(current).toHaveAttribute("aria-current", "page");
  // التبويب المختار متقدم للأمام، والبقية مائلة للخلف.
  const lean = (name: string) =>
    tabs
      .getByRole("link", { name, exact: true })
      .evaluate((el) => getComputedStyle(el).transform);
  await expect.poll(() => lean("الطلبات")).not.toMatch(/^none$/);
  expect(await lean("الطلبات")).not.toBe(await lean("العروض"));
  await tabs.getByRole("link", { name: "الرئيسية" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(tabs.getByRole("link", { name: "الرئيسية" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("«حسابي» is a dropdown that names the current page and closes with Escape", async ({
  page,
}) => {
  await family(page);
  await page.goto("/dashboard/orders");
  const nav = page.getByRole("navigation", { name: "حسابي", exact: true });
  const button = nav.getByText("قائمة حسابي");
  await expect(button).toContainText("لوحتي");
  await expect(nav.getByRole("link", { name: "طلباتي" })).toBeHidden();
  await button.click();
  await expect(nav.getByRole("link", { name: "طلباتي" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(nav.getByRole("link", { name: "طلباتي" })).toBeHidden();
  await button.click();
  // ضغطة خارج القائمة تغلقها.
  await page.locator("main").getByText("حساب أسرة منتجة").click();
  await expect(nav.getByRole("link", { name: "طلباتي" })).toBeHidden();
  await button.click();
  await nav.getByRole("link", { name: "معلوماتي" }).click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(nav.getByText("قائمة حسابي")).toContainText("معلوماتي");
});

test("«معلوماتي» opens into tabs: personal data, password, appearance and deletion", async ({
  page,
}) => {
  await family(page);
  await page.goto("/me");
  const tablist = page.getByRole("tablist", { name: "أقسام معلوماتي" });
  await expect(tablist.getByRole("tab")).toHaveText([
    "البيانات الشخصية",
    "كلمة المرور",
    "المظهر",
    "حذف الحساب",
  ]);
  await expect(
    tablist.getByRole("tab", { name: "البيانات الشخصية" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("رقم الجوال")).toHaveValue("+966500000041");
  // الأسهم تنتقل بين التبويبات (الأيسر للتالي في العربية).
  await tablist.getByRole("tab", { name: "البيانات الشخصية" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(tablist.getByRole("tab", { name: "كلمة المرور" })).toBeFocused();
  await expect(
    page.getByRole("tabpanel", { name: "كلمة المرور" }),
  ).toContainText("كلمة المرور الحالية");
  await expect(page.getByLabel("رقم الجوال")).toHaveCount(0);

  await tablist.getByRole("tab", { name: "المظهر" }).click();
  await expect(page).toHaveURL(/\/me#look$/);
  const najdi = page
    .getByRole("tabpanel", { name: "المظهر" })
    .getByRole("button", { name: /الباب النجدي/ });
  await najdi.click();
  await expect(najdi).toHaveAttribute("aria-pressed", "true");
  expect(
    (await page.context().cookies()).find((c) => c.name === "jdatna_template")
      ?.value,
  ).toBe("najdi");

  await tablist.getByRole("tab", { name: "حذف الحساب" }).click();
  await expect(
    page.getByRole("tabpanel").getByRole("link", { name: "حذف حسابي" }),
  ).toHaveAttribute("href", "/account/delete");
  // رابط مباشر لتبويب من صفحة أخرى.
  await page.goto("/orders");
  await page.goto("/me#look");
  await expect(tablist.getByRole("tab", { name: "المظهر" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
