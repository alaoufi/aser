import { test, expect } from "@playwright/test";

const admin = { id: "a", name: "مدير", phone: "+966500000009", role: "admin" };
async function asAdmin(page: import("@playwright/test").Page) {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: admin, registrationOpen: true } }),
  );
  await page.route("**/api/admin/summary", (r) =>
    r.fulfill({ json: { summary: {} } }),
  );
}

// كل أسرة تنتظر الاعتماد: تنبيه للمشرف في الموقع، وتبويب خاص بعدّاد.
test("admin is alerted to families waiting for approval and opens the approvals tab", async ({
  page,
}) => {
  await asAdmin(page);
  await page.route("**/api/admin/couriers", (r) =>
    r.fulfill({ json: { couriers: [] } }),
  );
  await page.route("**/api/admin/producers/pending", (r) =>
    r.fulfill({ json: { count: 1 } }),
  );
  await page.route("**/api/admin/producers", (r) =>
    r.fulfill({
      json: {
        producers: [
          {
            id: "00000000-0000-4000-8000-000000000011",
            name: "أسرة تنتظر",
            cityName: "الرياض",
            status: "pending",
            documentType: "producer_certificate",
            documentId: null,
          },
          {
            id: "00000000-0000-4000-8000-000000000012",
            name: "أسرة معتمدة",
            cityName: "الرياض",
            status: "approved",
            verified: true,
            documentType: "producer_certificate",
            documentId: "00000000-0000-4000-8000-000000000013",
          },
        ],
      },
    }),
  );
  await page.goto("/");
  const alert = page.locator(".approval-alert");
  await expect(alert).toContainText("أسرة منتجة تنتظر الاعتماد");
  await alert.getByRole("link", { name: "فتح اعتماد الأسر" }).click();
  await expect(page).toHaveURL(/\/admin\?tab=approvals$/);
  // القسم المفتوح ظاهر على زر قائمة الأقسام، وشارة الانتظار داخل القائمة.
  const nav = page.getByRole("navigation", { name: "أقسام الإدارة" });
  await expect(nav.locator("summary")).toContainText("اعتماد الأسر والمندوبين");
  await nav.locator("summary").click();
  const tab = nav.getByRole("button", { name: /اعتماد الأسر والمندوبين/ });
  await expect(tab).toHaveAttribute("aria-pressed", "true");
  await expect(tab).toContainText("1");
  await page.keyboard.press("Escape");
  const panel = page.getByRole("region", { name: "اعتماد الأسر المنتجة" });
  await expect(
    panel.getByRole("heading", { name: "أسرة تنتظر" }),
  ).toBeVisible();
  await expect(panel.getByText("أسرة معتمدة")).toHaveCount(0);
  // داخل الإدارة لا يتكرر التنبيه، فالعدّاد ظاهر على التبويب.
  await expect(page.locator(".approval-alert")).toHaveCount(0);
});

test("site texts can be searched by place, label or wording", async ({
  page,
}) => {
  await asAdmin(page);
  await page.route("**/api/admin/producers**", (r) =>
    r.fulfill({ json: { producers: [], count: 0 } }),
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
          t("home.search", "وش تطلب اليوم"),
          t("table.title", "مائدة اليوم"),
          t(
            "approval.message",
            "مبارك، تم اعتماد تسجيلك. نسأل الله لنا ولكم التوفيق",
          ),
        ],
      },
    }),
  );
  await page.goto("/admin");
  // أقسام الإدارة قائمة منسدلة: تُفتح ثم يُختار القسم.
  await page
    .getByRole("navigation", { name: "أقسام الإدارة" })
    .locator("summary")
    .click();
  await page.getByRole("button", { name: "نصوص الموقع", exact: true }).click();
  const search = page.getByLabel("بحث في النصوص");
  // بالهمزة أو دونها.
  await search.fill("إعتماد");
  await expect(page.getByLabel(/رسالة المباركة بعد الاعتماد/)).toHaveValue(
    /نسأل الله لنا ولكم التوفيق/,
  );
  await expect(page.getByLabel("نص خانة البحث")).toHaveCount(0);
  await search.fill("مائدة");
  await expect(page.getByLabel("عنوان المائدة")).toBeVisible();
  await expect(page.getByText("1 نتيجة")).toBeVisible();
  await search.fill("كلمة غير موجودة");
  await expect(page.getByText("لا توجد نصوص مطابقة.")).toBeVisible();
});
