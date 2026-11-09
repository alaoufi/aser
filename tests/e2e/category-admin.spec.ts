import { test, expect } from "@playwright/test";

const categories = [
  {
    id: "1",
    name: "الحلويات",
    slug: "sweets",
    icon: "✦",
    parentId: null,
    productCount: 3,
    childCount: 0,
    familyCount: 1,
  },
  {
    id: "2",
    name: "المشروبات",
    slug: "drinks",
    icon: "✦",
    parentId: null,
    productCount: 0,
    childCount: 1,
    familyCount: 0,
  },
  {
    id: "3",
    name: "مشروبات باردة",
    slug: "cold",
    icon: "✦",
    parentId: "2",
    productCount: 0,
    childCount: 0,
    familyCount: 2,
  },
];

test("categories are picked from a dropdown, edited in place, and deleted only when empty", async ({
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
  await page.route("**/api/admin/producers", (r) =>
    r.fulfill({ json: { producers: [] } }),
  );
  const sent: { method: string; body: unknown }[] = [];
  await page.route("**/api/admin/categories", async (r) => {
    const method = r.request().method();
    if (method === "GET") return r.fulfill({ json: { categories } });
    sent.push({ method, body: r.request().postDataJSON() });
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/admin");
  await page
    .getByRole("button", { name: "إدارة الأقسام", exact: true })
    .click();
  const picker = page.getByLabel("اختر القسم");
  await expect(picker.locator("option")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "حذف القسم" })).toHaveCount(0);

  // قسم له منتجات: يُعدَّل ولا يُحذف.
  await picker.selectOption("1");
  await expect(page.getByLabel("اسم القسم")).toHaveValue("الحلويات");
  await expect(page.getByRole("button", { name: "حذف القسم" })).toBeDisabled();
  await expect(
    page.getByText("احذف منتجاته أو انقلها لقسم آخر أولًا (3 منتج)"),
  ).toBeVisible();
  await page.getByLabel("اسم القسم").fill("الحلويات الشعبية");
  await page.getByRole("button", { name: "حفظ التعديل" }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({
    method: "PATCH",
    body: { id: "1", name: "الحلويات الشعبية" },
  });

  // قسم تحته فرعي: لا يُحذف.
  await picker.selectOption("2");
  await expect(page.getByRole("button", { name: "حذف القسم" })).toBeDisabled();

  // قسم فارغ: حذف بتأكيد.
  await picker.selectOption("3");
  await page.getByRole("button", { name: "حذف القسم" }).click();
  await expect(
    page.getByText("سيُزال القسم من اختيارات 2 أسرة منتجة."),
  ).toBeVisible();
  await page.getByRole("button", { name: "تأكيد حذف «مشروبات باردة»" }).click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toEqual({ method: "DELETE", body: { id: "3" } });
  await expect(picker).toHaveValue("");
});
