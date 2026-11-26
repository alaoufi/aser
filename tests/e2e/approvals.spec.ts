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

// كل أسرة تنتظر الاعتماد: عدّاد بجانب قسمها في قائمة اللوحة، والموقع شخصي بلا تنبيهات إدارية.
test("families waiting for approval show as a count in the panel menu, not on the site", async ({
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
  // الموقع شخصي: لا تنبيه إداري فيه.
  await expect(page.getByText("أسرة منتجة تنتظر الاعتماد")).toHaveCount(0);
  await page.goto("/admin");
  // على الجوال القائمة تُفتح بزر ☰.
  if ((page.viewportSize()?.width ?? 1280) < 1024)
    await page.getByRole("button", { name: "أقسام الإدارة" }).click();
  const menu = page.getByRole("complementary", { name: "أقسام الإدارة" });
  const item = menu.getByRole("link", { name: /اعتماد الأسر والمندوبين/ });
  await expect(item).toContainText("1");
  await item.click();
  await expect(page).toHaveURL(/\/admin\/approvals$/);
  // على الجوال تُغلق القائمة بعد الاختيار.
  if ((page.viewportSize()?.width ?? 1280) < 1024)
    await page.getByRole("button", { name: "أقسام الإدارة" }).click();
  await expect(item).toHaveAttribute("aria-current", "page");
  const panel = page.getByRole("region", { name: "اعتماد الأسر المنتجة" });
  await expect(
    panel.getByRole("heading", { name: "أسرة تنتظر" }),
  ).toBeVisible();
  await expect(panel.getByText("أسرة معتمدة")).toHaveCount(0);
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
  // كل قسم بمساره في القائمة الجانبية (src/lib/admin-nav.ts).
  await page.goto("/admin/texts");
  const search = page.getByLabel("بحث في النصوص");
  // بالهمزة أو دونها.
  await search.fill("إعتماد");
  // القائمة مضغوطة: كل نص سطر باسم وصفه يعرض نصه الحالي (تعديله من زر ⋮).
  await expect(
    page.getByRole("group", { name: /رسالة المباركة بعد الاعتماد/ }),
  ).toContainText(/نسأل الله لنا ولكم التوفيق/);
  await expect(page.getByLabel("نص خانة البحث")).toHaveCount(0);
  await search.fill("مائدة");
  await expect(
    page.getByRole("group", { name: "عنوان المائدة", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("1 نتيجة")).toBeVisible();
  await search.fill("كلمة غير موجودة");
  await expect(page.getByText("لا توجد نصوص مطابقة.")).toBeVisible();
});

// المعتمدة لا تُطالَب بالنواقص؛ الإدارة تتابعها من «من لديهم نواقص».
test("admin follows approved families with missing items from a dedicated filter", async ({
  page,
}) => {
  await asAdmin(page);
  await page.route("**/api/admin/producers**", (r) =>
    r.fulfill({
      json: {
        producers: [
          {
            id: "00000000-0000-4000-8000-000000000021",
            name: "أسرة بنواقص",
            cityName: "الرياض",
            status: "approved",
            verified: true,
            documentId: null,
            reviewReason: "إرفاق شهادة الأسرة المنتجة",
          },
          {
            id: "00000000-0000-4000-8000-000000000022",
            name: "أسرة مكتملة",
            cityName: "الرياض",
            status: "approved",
            verified: true,
            documentType: "producer_certificate",
            documentId: "00000000-0000-4000-8000-000000000023",
          },
        ],
      },
    }),
  );
  await page.goto("/admin/producers");
  const filters = page.getByRole("group", { name: "تصفية الأسر" });
  const missing = filters.getByRole("button", { name: /من لديهم نواقص/ });
  await expect(missing).toContainText("(1)");
  await missing.click();
  await expect(
    page.getByRole("heading", { name: "أسرة بنواقص" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "أسرة مكتملة" })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("النواقص المكتوبة عند الاعتماد: إرفاق شهادة الأسرة المنتجة"),
  ).toBeVisible();
});
