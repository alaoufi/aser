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
    "هوية الأسرة",
    "المنتجات",
    "الطلبات",
    "العروض",
    "الاشتراكات",
    "مكتبة الصور",
    "المشاهدات",
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
  await expect(tabs.getByRole("link", { name: "الرئيسية" })).toHaveAttribute(
    "href",
    "/dashboard",
  );
  await tabs.getByRole("link", { name: "المنتجات" }).click();
  await expect(page).toHaveURL(/\/dashboard\/products$/);
  await expect(tabs.getByRole("link", { name: "المنتجات" })).toHaveAttribute(
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
    "ادعُ صديقًا",
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
  await expect(tablist.getByRole("tab", { name: "ادعُ صديقًا" })).toBeFocused();
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

test("«المشاهدات» shows the family page views, its products total and each product", async ({
  page,
}) => {
  await family(page);
  await page.route("**/api/producer/views", (r) =>
    r.fulfill({
      json: {
        slug: "najdi",
        public: false,
        pageViews: 1250,
        productsViews: 340,
        products: [
          { id: "p1", name: "كبسة لحم", visible: true, views: 300 },
          { id: "p2", name: "جريش", visible: false, views: 40 },
        ],
      },
    }),
  );
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/dashboard/views");
  const tabs = page.getByRole("navigation", { name: "أقسام الأسرة المنتجة" });
  await expect(tabs.getByRole("link", { name: "المشاهدات" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const cards = page.getByRole("list", { name: "ملخص المشاهدات" });
  await expect(cards.getByRole("listitem")).toHaveText([
    "1,250مشاهدات صفحة الأسرة",
    "340إجمالي مشاهدات المنتجات",
    "1,590الإجمالي (الصفحة والمنتجات)",
  ]);
  const list = page.getByRole("list", { name: "مشاهدات المنتجات" });
  await expect(list.getByRole("listitem").first()).toContainText("كبسة لحم");
  await expect(list.getByRole("listitem").first()).toContainText("300 مشاهدة");
  await expect(list.getByRole("listitem").nth(1)).toContainText("(مخفي)");
  await expect(page.getByText("مخفية عن الزوار الآن")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
