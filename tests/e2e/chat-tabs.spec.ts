import { test, expect, type Page } from "@playwright/test";

const at = "2026-11-18T09:00:00.000Z";
const conversations = [
  {
    id: "c-fam",
    side: "customer",
    kind: "family",
    title: "أسرة الجريش",
    preview: "حياك",
    lastAt: at,
    unread: 0,
  },
  {
    id: "c-cou",
    side: "customer",
    kind: "courier",
    title: "سعد المندوب",
    preview: "أنا في الطريق",
    lastAt: at,
    unread: 2,
  },
];

async function as(page: Page, role: string) {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: { id: "u1", name: "حساب", phone: "+966500000071", role },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/producer/status", (r) =>
    r.fulfill({ json: { state: null } }),
  );
  await page.route("**/api/conversations", (r) =>
    r.fulfill({ json: { conversations } }),
  );
}

// المحادثات بتبويبات: العميل يرى «الأسر المنتجة» و«المندوبين»، وكل تبويب بمحادثاته وعدد غير المقروء.
test("customers see conversations split into families and couriers tabs", async ({
  page,
}) => {
  await as(page, "customer");
  await page.goto("/messages");
  const tabs = page.getByRole("tablist", { name: "أنواع المحادثات" });
  await expect(tabs.getByRole("tab")).toHaveText([
    "الأسر المنتجة",
    "المندوبين2 غير مقروءة",
  ]);
  const list = page.getByRole("complementary", { name: "المحادثات" });
  // يفتح على التبويب الذي فيه رسائل جديدة.
  await expect(tabs.getByRole("tab", { name: /المندوبين/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(list.getByText("سعد المندوب")).toBeVisible();
  await expect(list.getByText("أسرة الجريش")).toHaveCount(0);
  await tabs.getByRole("tab", { name: "الأسر المنتجة" }).click();
  await expect(list.getByText("أسرة الجريش")).toBeVisible();
  await expect(list.getByText("سعد المندوب")).toHaveCount(0);
});

// المندوب: تبويبا «الأسر المنتجة» و«العملاء».
test("couriers see families and customers tabs", async ({ page }) => {
  await as(page, "courier");
  await page.goto("/messages");
  await expect(
    page.getByRole("tablist", { name: "أنواع المحادثات" }).getByRole("tab"),
  ).toHaveText([/^الأسر المنتجة/, /^العملاء/]);
});
