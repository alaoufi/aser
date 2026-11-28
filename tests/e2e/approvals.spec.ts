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
  // كل ما يخص الأسر في «الأسر المنتجة» (قرار المالك 2026-11-28): العدد بجانبها، والأسر كلها بحالاتها.
  const item = menu.getByRole("link", { name: /الأسر المنتجة/ });
  await expect(item).toContainText("1");
  await expect(
    menu.getByRole("link", { name: /اعتماد المندوبين/ }),
  ).not.toContainText("1");
  await item.click();
  await expect(page).toHaveURL(/\/admin\/producers$/);
  // على الجوال تُغلق القائمة بعد الاختيار.
  if ((page.viewportSize()?.width ?? 1280) < 1024)
    await page.getByRole("button", { name: "أقسام الإدارة" }).click();
  await expect(item).toHaveAttribute("aria-current", "page");
  const waiting = page.locator(
    "#family-row-00000000-0000-4000-8000-000000000011",
  );
  await expect(waiting).toContainText("أسرة تنتظر");
  await expect(waiting).toContainText("تحت المراجعة");
  await expect(
    page.locator("#family-row-00000000-0000-4000-8000-000000000012"),
  ).toContainText("أسرة معتمدة");
  // «اعتماد المندوبين» يدل على الأسر المنتظرة هنا.
  await page.goto("/admin/approvals");
  await expect(
    page.getByText(/1 أسرة تنتظر الموافقة، تجدها مع كل الأسر/),
  ).toBeVisible();
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
  // القائمة المنسدلة للأقسام (طلب المالك 2026-11-28): الرسائل وحدها، أو الواجهة العامة وحدها.
  await search.fill("");
  const section = page.getByRole("combobox", { name: "القسم", exact: true });
  await expect
    .poll(() => section.locator("option").allTextContents())
    .toEqual(["كل الأقسام", "الواجهة العامة (2)", "الرسائل (1)"]);
  await section.selectOption("الرسائل");
  await expect(
    page.getByRole("group", { name: /رسالة المباركة بعد الاعتماد/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "عنوان المائدة", exact: true }),
  ).toHaveCount(0);
  await section.selectOption("الواجهة العامة");
  await expect(
    page.getByRole("group", { name: "عنوان المائدة", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: /رسالة المباركة بعد الاعتماد/ }),
  ).toHaveCount(0);
  await page.screenshot({ path: "test-results/texts-sections.png" });
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
  // قائمة مضغوطة (قرار المالك 2026-11-28): سطر لكل أسرة، والبطاقة الكاملة من ⋮ ← «تفاصيل».
  await expect(page.getByText("أسرة بنواقص", { exact: true })).toBeVisible();
  await expect(page.getByText("أسرة مكتملة", { exact: true })).toHaveCount(0);
  await page.getByLabel("خيارات أسرة بنواقص").click();
  await page.getByRole("button", { name: "تفاصيل", exact: true }).click();
  await expect(
    page.getByText("النواقص المكتوبة عند الاعتماد: إرفاق شهادة الأسرة المنتجة"),
  ).toBeVisible();
});

// قرار المالك 2026-11-26: بعد انتهاء مهلة المستندات تختار الإدارة «تمديد» أو «إخفاء المنتجات حتى رفع المستندات».
test("admin extends a late family's document deadline or hides its products until it uploads", async ({
  page,
}) => {
  await asAdmin(page);
  const family = {
    id: "00000000-0000-4000-8000-000000000031",
    name: "شاهي متأخرة",
    cityName: "الرياض",
    status: "approved",
    verified: false,
    documentId: null,
    docsDueAt: "2026-11-01T00:00:00Z",
    docsHiddenAt: null as string | null,
  };
  await page.route("**/api/admin/producers**", (r) =>
    r.fulfill({ json: { producers: [family] } }),
  );
  const sent: unknown[] = [];
  await page.route(`**/api/admin/producers/${family.id}/docs`, (r) => {
    const body = r.request().postDataJSON();
    sent.push(body);
    if (body.action === "hide") family.docsHiddenAt = "2026-11-26T00:00:00Z";
    else family.docsHiddenAt = null;
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/admin/producers");
  const filters = page.getByRole("group", { name: "تصفية الأسر" });
  await filters.getByRole("button", { name: /تأخرت في المستندات/ }).click();
  await page.getByLabel("خيارات شاهي متأخرة").click();
  await page.getByRole("button", { name: "تفاصيل", exact: true }).click();
  await expect(page.getByText(/تأخرت في المستندات: /)).toBeVisible();
  const box = page.getByRole("group", { name: "مهلة المستندات" });
  await box
    .getByRole("button", { name: "إخفاء المنتجات حتى رفع المستندات" })
    .click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toEqual({ action: "hide" });
  await expect(
    box.getByText(/منتجات هذه الأسرة مخفية حتى ترفع المستندات/),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/docs-admin.png",
    fullPage: true,
  });
  await box.getByLabel("مدة التمديد").selectOption("30");
  await box.getByRole("button", { name: "تمديد المهلة" }).click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toEqual({ action: "extend", days: 30 });
  await expect(
    box.getByRole("button", { name: "إخفاء المنتجات حتى رفع المستندات" }),
  ).toBeVisible();
});

// قائمة «الأسر المنتجة» (قرار المالك 2026-11-28): سطور متقاربة بحالة الحساب، وأمام كل أسرة ⋮ فيه
// تفاصيل، تنشيط، توثيق، إيقاف، إخفاء — وكلها برسالة تأكيد؛ الإيقاف والإخفاء بسبب.
test("each family is one compact row with its status and a ⋮ menu whose actions ask for confirmation", async ({
  page,
}) => {
  await asAdmin(page);
  const id = "00000000-0000-4000-8000-000000000041";
  const family: Record<string, unknown> = {
    id,
    name: "أم فهد",
    tradeName: "مطبخ ام فهد",
    ownerName: "أم فهد",
    cityName: "جازان",
    status: "approved",
    verified: true,
    documentId: null,
    adminVerifiedAt: null,
  };
  await page.route("**/api/admin/producers**", (r) =>
    r.fulfill({ json: { producers: [family] } }),
  );
  const sent: unknown[] = [];
  await page.route(`**/api/admin/producers/${id}/action`, (r) => {
    const body = r.request().postDataJSON();
    sent.push(body);
    if (body.action === "verify")
      family.adminVerifiedAt = "2026-11-28T10:00:00Z";
    if (body.action === "hide") family.status = "hidden";
    if (body.action === "unhide") family.status = "approved";
    return r.fulfill({ json: { status: family.status } });
  });
  await page.goto("/admin/producers");
  const row = page.locator(`#family-row-${id}`);
  await expect(row).toContainText("مطبخ ام فهد");
  await expect(row).toContainText("نشط");
  const menu = page.getByLabel("خيارات مطبخ ام فهد");
  await menu.click();
  const items = await row
    .locator(".family-row-menu-list button")
    .allTextContents();
  expect(items).toEqual(["تفاصيل", "توثيق", "إيقاف", "إخفاء"]);
  // توثيق: رسالة تأكيد ثم الحفظ.
  await row.getByRole("button", { name: "توثيق", exact: true }).click();
  const confirm = row.getByRole("alertdialog");
  await expect(confirm).toContainText("توثيق «مطبخ ام فهد»؟");
  expect(sent).toHaveLength(0);
  await confirm.getByRole("button", { name: "نعم، تأكيد" }).click();
  await expect.poll(() => sent).toEqual([{ action: "verify" }]);
  await expect(row).toContainText("موثّقة ✓");
  // السبب اختياري (قرار المالك 2026-11-28)، والتراجع لا يرسل شيئًا.
  await menu.click();
  await row.getByRole("button", { name: "إخفاء", exact: true }).click();
  await expect(
    confirm.getByRole("button", { name: "نعم، تأكيد" }),
  ).toBeEnabled();
  await confirm.getByRole("button", { name: "تراجع" }).click();
  await expect(confirm).toHaveCount(0);
  await menu.click();
  await row.getByRole("button", { name: "إخفاء", exact: true }).click();
  await confirm
    .getByLabel("السبب (اختياري، يصل للأسرة)")
    .fill("الصور غير واضحة");
  await page.screenshot({ path: "test-results/family-rows.png" });
  await confirm.getByRole("button", { name: "نعم، تأكيد" }).click();
  await expect
    .poll(() => sent.at(-1))
    .toEqual({ action: "hide", reason: "الصور غير واضحة" });
  await expect(row).toContainText("مخفية مؤقتًا");
  await menu.click();
  await expect(row.locator(".family-row-menu-list button")).toHaveText([
    "تفاصيل",
    "إظهار",
    "إيقاف",
  ]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

// ملاحظة المالك 2026-11-28: إشعار إداري يُفتح من الموقع بالجلسة الشخصية كان يقول «ليست لديك صلاحية».
test("an admin opening an admin link from the personal site gets a one-tap way into the panel", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "a",
          name: "مدير",
          phone: "+966500000009",
          role: "customer",
          adminAccess: true,
        },
        registrationOpen: true,
      },
    }),
  );
  await page.goto(
    "/admin/approvals?family=00000000-0000-4000-8000-000000000041",
  );
  await expect(page.getByText("ليست لديك صلاحية الوصول")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "افتح لوحة الإدارة" }),
  ).toBeVisible();
});

// قرار المالك 2026-11-28: المدير العام يحدد من يستقبل إشعارات الموافقات، ويرى جنسية المندوب.
test("the general manager chooses who receives approval notifications and sees the courier's nationality", async ({
  page,
}) => {
  await asAdmin(page);
  await page.route("**/api/admin/producers**", (r) =>
    r.fulfill({ json: { producers: [], count: 0 } }),
  );
  await page.route("**/api/admin/couriers", (r) =>
    r.fulfill({
      json: {
        couriers: [
          {
            id: "00000000-0000-4000-8000-000000000071",
            userId: "u71",
            name: "حسن المندوب",
            phone: "+966500000071",
            carType: "دباب",
            nationality: "يمني",
            cityName: "الرياض",
            documentId: null,
            nationalId: "",
            status: "pending",
            reviewReason: null,
            familyName: "مطبخ أم محمد",
          },
        ],
      },
    }),
  );
  const people = [
    { id: "a", name: "مدير", phone: "", role: "admin", memberNo: 1, on: true },
    {
      id: "b",
      name: "مشرف الاعتماد",
      phone: "",
      role: "customer",
      memberNo: 2,
      on: true,
    },
  ];
  let posted: unknown;
  await page.route("**/api/admin/approval-alerts", (r) => {
    if (r.request().method() === "POST") {
      posted = r.request().postDataJSON();
      const p = people.find((x) => x.id === (posted as { id: string }).id)!;
      p.on = (posted as { on: boolean }).on;
      return r.fulfill({ json: posted });
    }
    return r.fulfill({ json: { recipients: people } });
  });
  await page.goto("/admin/approvals");
  const couriers = page.getByRole("region", { name: "اعتماد المندوبين" });
  await expect(couriers).toContainText("حسن المندوب");
  await expect(couriers).toContainText("الجنسية: يمني");
  const box = page.getByRole("region", { name: "من يستقبل إشعارات الموافقات" });
  const approver = box.getByRole("checkbox", { name: /مشرف الاعتماد/ });
  await expect(approver).toBeChecked();
  await approver.uncheck();
  await expect(box).toContainText("تم الحفظ.");
  expect(posted).toEqual({ id: "b", on: false });
  await expect(approver).not.toBeChecked();
});
