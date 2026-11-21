import { test, expect, type Page } from "@playwright/test";

/** «سجل النشاطات» و«تكاملات API» و«حقول النماذج» بنودًا في القائمة الجانبية (من «أي خدمة»). */
async function asOwner(page: Page) {
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
  await page.route("**/api/admin/menu-layout", (r) =>
    r.fulfill({ json: { layout: null } }),
  );
}

test("the activity log lists what managers did, filters by kind, and loads older pages", async ({
  page,
}) => {
  await asOwner(page);
  const asked: string[] = [];
  await page.route("**/api/admin/activity**", (r) => {
    const url = new URL(r.request().url());
    asked.push(url.search);
    const older = url.searchParams.get("before");
    return r.fulfill({
      json: {
        groups: [
          { id: "families", label: "الأسر والمندوبون" },
          { id: "backups", label: "النسخ الاحتياطية" },
        ],
        more: !older,
        rows: [
          {
            id: older ? "2" : "1",
            action: older ? "producer.review" : "backup.delete",
            label: older ? "قرار مراجعة أسرة" : "حذف نسخة احتياطية",
            actorName: "المدير",
            actorPhone: "+966500000009",
            targetId: null,
            details: '{"file":"jdatna-20261120T020000Z.tar.gpg"}',
            createdAt: new Date(Date.now() - (older ? 864e5 : 0)).toISOString(),
          },
        ],
      },
    });
  });
  await page.goto("/admin/activity");
  const list = page.getByRole("list", { name: "النشاطات" });
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText("حذف نسخة احتياطية");
  await expect(list).toContainText("المدير");
  await page.getByRole("button", { name: "أقدم" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list).toContainText("قرار مراجعة أسرة");
  await page.getByLabel("النوع").selectOption({ label: "النسخ الاحتياطية" });
  await expect.poll(() => asked.at(-1)).toContain("group=backups");
  await page.getByLabel("العضو (الاسم أو الجوال)").fill("0500");
  await page.getByRole("button", { name: "بحث" }).click();
  await expect.poll(() => asked.at(-1)).toContain("q=0500");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("integrations show connected or not, without any key", async ({
  page,
}) => {
  await asOwner(page);
  await page.route("**/api/admin/integrations", (r) =>
    r.fulfill({
      json: {
        items: [
          {
            id: "sms",
            label: "الرسائل النصية (SMS)",
            what: "رموز التحقق",
            ok: true,
            note: "x",
          },
          {
            id: "r2",
            label: "التخزين الخارجي للنسخ (Cloudflare R2)",
            what: "رفع النسخ",
            ok: false,
            note: "بدونه تبقى النسخ على الخادم وحده.",
          },
        ],
      },
    }),
  );
  await page.goto("/admin/integrations");
  const list = page.getByRole("list", { name: "الخدمات" });
  await expect(list.getByRole("listitem").first()).toContainText("مربوطة ✓");
  await expect(list.getByRole("listitem").nth(1)).toContainText("غير مربوطة");
  await expect(list.getByRole("listitem").nth(1)).toContainText(
    "بدونه تبقى النسخ على الخادم وحده.",
  );
  await expect(page.locator("header strong")).toHaveText("تكاملات API");
});
