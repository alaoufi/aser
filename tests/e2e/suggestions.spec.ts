import { test, expect } from "@playwright/test";

// «الاقتراحات» للجميع: رابط في التذييل، ونموذج للزائر بالاسم والتواصل الاختياريين.
test("a visitor sends a suggestion from the footer link", async ({ page }) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: null, registrationOpen: true } }),
  );
  let sent: unknown;
  await page.route("**/api/suggestions", (r) => {
    sent = r.request().postDataJSON();
    return r.fulfill({ status: 201, json: { sent: true } });
  });
  await page.goto("/");
  await page
    .locator("footer")
    .getByRole("link", { name: "الاقتراحات" })
    .click();
  await expect(page).toHaveURL(/\/suggestions$/);
  await page.getByLabel("اقتراحك").fill("أقترح إضافة قسم للحلويات الموسمية");
  await page.getByLabel("اسمك (اختياري)").fill("أبو فهد");
  await page.getByLabel("جوالك أو بريدك للرد (اختياري)").fill("0500000000");
  await page.getByRole("button", { name: "إرسال الاقتراح" }).click();
  await expect(page.getByText("شكرًا لك، وصل اقتراحك للإدارة ✓")).toBeVisible();
  expect(sent).toEqual({
    body: "أقترح إضافة قسم للحلويات الموسمية",
    name: "أبو فهد",
    contact: "0500000000",
  });
});

// روابط «حسابي» أزرار واضحة، والصفحة الحالية مميزة.
test("account links look like buttons and mark the current page", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "c",
          name: "عميل",
          phone: "+966500000031",
          role: "customer",
        },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/orders", (r) => r.fulfill({ json: { orders: [] } }));
  await page.goto("/orders");
  const nav = page.getByRole("navigation", { name: "حسابي", exact: true });
  // قائمة «حسابي» منسدلة: زرها يحمل اسم الصفحة الحالية.
  await expect(nav.getByText("قائمة حسابي")).toContainText("طلباتي");
  await nav.getByText("قائمة حسابي").click();
  const current = nav.getByRole("link", { name: "طلباتي" });
  await expect(current).toHaveAttribute("aria-current", "page");
  const other = nav.getByRole("link", { name: "المحادثات" });
  // بعد انتهاء حركة فتح القائمة.
  await expect
    .poll(() => other.evaluate((el) => el.getBoundingClientRect().height))
    .toBeGreaterThanOrEqual(44);
  const style = await other.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      border: s.borderTopWidth,
      height: el.getBoundingClientRect().height,
    };
  });
  expect(parseFloat(style.border)).toBeGreaterThan(0);
  expect(style.height).toBeGreaterThanOrEqual(44);
});

// الإدارة: الاقتراحات لمسؤول الإدارة، وحقل نصوص الموقع يتمدد مع الكتابة.
test("the admin reads suggestions, and site-text fields grow with their text", async ({
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
  await page.route("**/api/admin/producers**", (r) =>
    r.fulfill({ json: { producers: [], count: 0 } }),
  );
  await page.route("**/api/admin/couriers", (r) =>
    r.fulfill({ json: { couriers: [] } }),
  );
  await page.route("**/api/admin/suggestions", (r) =>
    r.fulfill({
      json: {
        suggestions: [
          {
            id: "00000000-0000-4000-8000-000000000051",
            name: "أبو فهد",
            contact: "0500000000",
            body: "أقترح إضافة قسم للحلويات الموسمية",
            readAt: null,
            createdAt: "2026-11-15T08:00:00Z",
          },
        ],
      },
    }),
  );
  const t = (key: string, value: string) => ({
    key,
    value,
    original: value,
    edited: false,
    hidden: false,
  });
  await page.route("**/api/admin/texts", (r) =>
    r.fulfill({
      json: {
        texts: [
          t("home.searchButton", "ابحث"),
          t("push.ios", "نص طويل ".repeat(60)),
        ],
      },
    }),
  );
  await page.goto("/admin?tab=suggestions");
  await expect(
    page.getByText("أقترح إضافة قسم للحلويات الموسمية"),
  ).toBeVisible();
  await expect(page.getByText(/جديدة: 1/)).toBeVisible();
  // أقسام الإدارة قائمة منسدلة: تُفتح ثم يُختار القسم.
  await page
    .getByRole("navigation", { name: "أقسام الإدارة" })
    .locator("summary")
    .click();
  await page.getByRole("button", { name: "نصوص الموقع", exact: true }).click();
  const short = page.getByLabel("زر البحث");
  const long = page.getByLabel("إرشاد الآيفون");
  const height = (l: typeof short) =>
    l.evaluate((el) => el.getBoundingClientRect().height);
  const shortHeight = await height(short);
  expect(shortHeight).toBeLessThan(80);
  expect(await height(long)).toBeGreaterThan(shortHeight * 2);
  // الكتابة الطويلة تمدد الحقل القصير.
  await short.fill("كلمة ".repeat(80));
  await expect.poll(() => height(short)).toBeGreaterThan(shortHeight * 2);
});
