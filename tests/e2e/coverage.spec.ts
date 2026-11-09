import { test, expect } from "@playwright/test";
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "أسرة الاختبار",
  phone: "+966500000011",
  role: "producer",
};
const nodes = [
  {
    id: "r",
    kind: "region",
    name: "القصيم",
    parentId: null,
    regionId: "qassim",
    cityId: null,
    legacy: false,
    label: "القصيم",
  },
  {
    id: "g",
    kind: "governorate",
    name: "محافظة الاختبار",
    parentId: "r",
    regionId: "qassim",
    cityId: null,
    legacy: false,
    label: "القصيم / محافظة الاختبار",
  },
  {
    id: "c",
    kind: "city",
    name: "مدينة الاختبار",
    parentId: "g",
    regionId: "qassim",
    cityId: "testcity",
    legacy: false,
    label: "القصيم / محافظة الاختبار / مدينة الاختبار",
  },
  {
    id: "a",
    kind: "center",
    name: "مركز أول",
    parentId: "c",
    regionId: "qassim",
    cityId: null,
    legacy: false,
    label: "القصيم / محافظة الاختبار / مدينة الاختبار / مركز أول",
  },
  {
    id: "b",
    kind: "center",
    name: "مركز ثان",
    parentId: "c",
    regionId: "qassim",
    cityId: null,
    legacy: false,
    label: "القصيم / محافظة الاختبار / مدينة الاختبار / مركز ثان",
  },
  {
    id: "h",
    kind: "neighborhood",
    name: "حي الاختبار",
    parentId: "a",
    regionId: "qassim",
    cityId: null,
    legacy: false,
    label: "القصيم / محافظة الاختبار / مدينة الاختبار / مركز أول / حي الاختبار",
  },
];
test("family chooses multiple hierarchical areas with fees and dependent resets", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user, registrationOpen: true } }),
  );
  await page.route("**/api/coverage", (r) => r.fulfill({ json: { nodes } }));
  let saved: any;
  await page.route("**/api/producer/coverage", async (r) => {
    if (r.request().method() === "PUT") {
      saved = r.request().postDataJSON();
      await r.fulfill({ json: { ok: true } });
    } else
      await r.fulfill({
        json: {
          areas: [],
          legacyAreas: [{ label: "بريدة (تغطية سابقة)", fee: null }],
        },
      });
  });
  await page.goto("/dashboard/coverage");
  await page.getByLabel("المنطقة", { exact: true }).selectOption("r");
  await page.getByLabel("المحافظة", { exact: true }).selectOption("g");
  await page.getByLabel("المدينة", { exact: true }).selectOption("c");
  await page.getByLabel("المركز (اختياري)", { exact: true }).selectOption("a");
  await page.getByLabel("الحي (اختياري)", { exact: true }).selectOption("h");
  await page.getByRole("button", { name: "أضف إلى التغطية" }).click();
  await page.getByLabel("المركز (اختياري)", { exact: true }).selectOption("b");
  await expect(
    page.getByLabel("اسم المركز (اختياري)", { exact: true }),
  ).toHaveValue("مركز ثان");
  await expect(page.getByLabel("الحي (اختياري)", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "أضف إلى التغطية" }).click();
  await page
    .getByLabel("رسوم التوصيل (ريال، اختيارية)", { exact: true })
    .first()
    .fill("10");
  await page.getByRole("button", { name: "حفظ التغطية", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("تم حفظ نطاقات التغطية");
  expect(saved).toEqual({
    customAreas: [],
    areas: [
      { nodeId: "h", fee: 10 },
      { nodeId: "b", fee: null },
    ],
  });
  await expect(page.getByText(/تغطية التوصيل السابقة محفوظة/)).toBeVisible();
  await page.getByLabel("المنطقة", { exact: true }).selectOption("");
  await expect(page.getByLabel("المحافظة", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("المدينة", { exact: true })).toHaveValue("");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
test("admin must explicitly confirm exception when reviewing a document-free application", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: { user: { ...user, role: "admin" }, registrationOpen: true },
    }),
  );
  await page.route("**/api/admin/producers", (r) =>
    r.fulfill({
      json: {
        producers: [
          {
            id: "00000000-0000-4000-8000-000000000002",
            name: "أسرة الاستثناء",
            cityName: "القصيم",
            status: "pending",
            documentType: "exception",
            documentId: null,
            reviewReason: "طلب أهلية للمراجعة الإدارية",
          },
        ],
      },
    }),
  );
  let body: any;
  await page.route("**/api/admin/producers/*/review", async (r) => {
    body = r.request().postDataJSON();
    await r.fulfill({ json: { status: "approved" } });
  });
  await page.goto("/admin");
  await page
    .getByRole("combobox", { name: "القرار", exact: true })
    .selectOption("approved");
  await page
    .getByLabel(/سبب القرار/)
    .fill("استثناء موثق بعد مراجعة أهلية الأسرة المنتجة");
  await page
    .getByLabel(
      "تحققت من أهلية النشاط واستيفاء التراخيص الإلزامية قبل الاعتماد.",
    )
    .check();
  const confirm = page.getByRole("checkbox", { name: /أمنح استثناءً إداريًا/ });
  await expect(confirm).toHaveAttribute("required", "");
  await confirm.check();
  await page.getByRole("button", { name: "حفظ قرار المراجعة" }).click();
  await expect(page.getByRole("status")).toHaveText("تم حفظ قرار المراجعة.");
  expect(body.exceptionApproved).toBe(true);
});

test("family adds several named neighborhoods and centers under legacy cities, persists and removes own picks", async ({
  page,
}) => {
  const city1 = { ...nodes[2], parentId: "r", legacy: true };
  const city2 = {
    ...city1,
    id: "c2",
    name: "مدينة ثانية",
    label: "القصيم / مدينة ثانية",
  };
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user, registrationOpen: true } }),
  );
  await page.route("**/api/coverage", (r) =>
    r.fulfill({ json: { nodes: [nodes[0], city1, city2] } }),
  );
  let saved: any = { areas: [{ nodeId: "c2", fee: 7 }], customAreas: [] };
  await page.route("**/api/producer/coverage", (r) => {
    if (r.request().method() === "PUT") {
      saved = r.request().postDataJSON();
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({
      json: { ...saved, legacyAreas: [{ label: "تغطية قديمة", fee: 3 }] },
    });
  });
  await page.goto("/dashboard/coverage");
  await page.getByLabel("المنطقة", { exact: true }).selectOption("r");
  await page.getByLabel("المدينة", { exact: true }).selectOption("c");
  await page
    .getByLabel("اسم المركز (اختياري)", { exact: true })
    .fill("مركز أول");
  await page.getByLabel("اسم الحي (اختياري)", { exact: true }).fill("حي أول");
  await page
    .getByRole("button", { name: "أضف الحي أو المركز", exact: true })
    .click();
  await page.getByLabel("اسم الحي (اختياري)", { exact: true }).fill("حي ثان");
  await page
    .getByRole("button", { name: "أضف الحي أو المركز", exact: true })
    .click();
  await page
    .getByLabel("رسوم التوصيل (ريال، اختيارية)", { exact: true })
    .first()
    .fill("10");
  await page.getByLabel("اسم الحي (اختياري)", { exact: true }).fill("يجب مسحه");
  await page.getByLabel("المدينة", { exact: true }).selectOption("c2");
  await expect(
    page.getByLabel("اسم الحي (اختياري)", { exact: true }),
  ).toHaveValue("");
  await page
    .getByLabel("اسم المركز (اختياري)", { exact: true })
    .fill("مركز آخر");
  await page
    .getByRole("button", { name: "أضف الحي أو المركز", exact: true })
    .click();
  await page.getByRole("button", { name: "حفظ التغطية", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("تم حفظ نطاقات التغطية");
  expect(saved).toEqual({
    areas: [{ nodeId: "c2", fee: 7 }],
    customAreas: [
      { cityNodeId: "c", center: "مركز أول", neighborhood: "حي أول", fee: 10 },
      { cityNodeId: "c", center: null, neighborhood: "حي ثان", fee: null },
      { cityNodeId: "c2", center: "مركز آخر", neighborhood: null, fee: null },
    ],
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "إزالة حي أول", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "إزالة حي ثان", exact: true }).click();
  await page.getByRole("button", { name: "حفظ التغطية", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("تم حفظ نطاقات التغطية");
  expect(saved.customAreas).toHaveLength(2);
  expect(saved.areas).toEqual([{ nodeId: "c2", fee: 7 }]);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: "artifacts/coverage-custom-form.png",
    fullPage: true,
  });
});
