import { test, expect } from "@playwright/test";

/**
 * قرار المالك 2026-11-28: عند أول دخول للإدارة نافذة بالأسر التي تنتظر الموافقة، وكل أسرة تفتح
 * بطاقتها كاملة (البيانات والمستندات وخيارات القرار الخمسة). مرة في الجلسة.
 */
const admin = { id: "a", name: "مدير", phone: "+966500000009", role: "admin" };
const familyId = "00000000-0000-4000-8000-000000000021";

test("on entering the panel, admins see the families waiting and open one with its full card", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: admin, registrationOpen: true } }),
  );
  await page.route("**/api/admin/summary", (r) =>
    r.fulfill({ json: { summary: {} } }),
  );
  await page.route("**/api/admin/couriers", (r) =>
    r.fulfill({ json: { couriers: [] } }),
  );
  await page.route("**/api/admin/producers/pending", (r) =>
    r.fulfill({
      json: {
        count: 1,
        families: [
          {
            id: familyId,
            name: "شعبيات الأولين",
            createdAt: "2026-11-27T09:00:00Z",
          },
        ],
      },
    }),
  );
  await page.route("**/api/admin/producers", (r) =>
    r.fulfill({
      json: {
        producers: [
          {
            id: familyId,
            name: "أم محمد",
            tradeName: "شعبيات الأولين",
            ownerName: "أم محمد",
            phone: "+966500000021",
            cityName: "الرياض",
            status: "pending",
            documentType: "producer_certificate",
            documentId: "00000000-0000-4000-8000-000000000022",
            documents: [
              {
                id: "00000000-0000-4000-8000-000000000022",
                fileName: "شهادة.pdf",
              },
            ],
          },
        ],
      },
    }),
  );
  await page.goto("/admin");
  const dialog = page.getByRole("dialog", { name: "أسر تنتظر الموافقة" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("1 أسرة سجّلت");
  await expect(dialog).toContainText("شعبيات الأولين");
  await page.screenshot({ path: "test-results/pending-families.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await dialog.getByRole("link", { name: "افتح الأسرة" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/approvals\\?family=${familyId}$`),
  );
  await expect(dialog).toHaveCount(0);
  // بطاقة الأسرة كاملة: البيانات والمستند والقرارات الخمسة.
  const card = page.locator(`#family-${familyId}`);
  await expect(card).toBeFocused();
  await expect(card).toContainText("صاحب الحساب: أم محمد");
  await expect(
    card.getByRole("link", { name: /عرض المستند الخاص/ }),
  ).toBeVisible();
  const options = await card
    .getByRole("combobox")
    .locator("option:not([disabled])")
    .allTextContents();
  expect(options).toHaveLength(5);
  // مرة في الجلسة: لا تعود عند التنقل.
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "لوحة التحكم" })).toHaveCount(
    1,
  );
  await expect(dialog).toHaveCount(0);
});

test("no dialog when nobody is waiting", async ({ page }) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: admin, registrationOpen: true } }),
  );
  await page.route("**/api/admin/summary", (r) =>
    r.fulfill({ json: { summary: {} } }),
  );
  await page.route("**/api/admin/producers**", (r) =>
    r.fulfill({ json: { producers: [], count: 0, families: [] } }),
  );
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "لوحة التحكم" })).toHaveCount(
    1,
  );
  await expect(
    page.getByRole("dialog", { name: "أسر تنتظر الموافقة" }),
  ).toHaveCount(0);
});
