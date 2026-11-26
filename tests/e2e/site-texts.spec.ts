import { test, expect } from "@playwright/test";

test("admin edits, deletes and restores visible site texts", async ({
  page,
}, info) => {
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
  const texts = [
    {
      key: "table.empty",
      value: "بانتظار العروض",
      original: "بانتظار العروض",
      edited: false,
      hidden: false,
    },
    {
      key: "table.title",
      value: "مائدة اليوم",
      original: "مائدة اليوم",
      edited: false,
      hidden: false,
    },
    {
      key: "about.h1",
      value: "من أهل الصنعة إليك",
      original: "من أهل الصنعة إليك",
      edited: false,
      hidden: false,
    },
    {
      key: "about.p1",
      value: "تصفح الأسر والمنتجات",
      original: "تصفح الأسر والمنتجات",
      edited: false,
      hidden: false,
    },
    {
      key: "footer.made",
      value: "",
      original: "صُنع ليقرّب أهل الدار",
      edited: true,
      hidden: false,
    },
  ];
  const sent: unknown[] = [];
  await page.route("**/api/admin/texts", async (r) => {
    if (r.request().method() === "PUT") {
      const body = r.request().postDataJSON();
      sent.push(body);
      const t = texts.find((x) => x.key === body.key)!;
      if ("hidden" in body) {
        t.hidden = body.hidden;
        return r.fulfill({ json: { texts } });
      }
      t.value = body.value ?? t.original;
      t.edited = t.value !== t.original;
    }
    return r.fulfill({ json: { texts } });
  });
  // كل قسم بمساره في القائمة الجانبية (src/lib/admin-nav.ts).
  await page.goto("/admin/texts");
  // قائمة مضغوطة: كل نص سطر يعرض نصه، وأمامه زر ⋮ فيه تعديل/حفظ وإخفاء وحذف واستعادة.
  const open = async (name: string) => {
    await page.getByLabel(`خيارات «${name}»`, { exact: true }).click();
  };
  const choose = (name: string) =>
    page.getByRole("button", { name, exact: true }).locator("visible=true");
  await expect(page.getByLabel(/^المائدة الفارغة/)).toHaveText(
    "بانتظار العروض",
  );
  await page.screenshot({
    path: `test-results/site-texts-list-${info.project.name}.png`,
    fullPage: true,
  });

  await open("المائدة الفارغة");
  await page.screenshot({
    path: `test-results/site-texts-menu-${info.project.name}.png`,
  });
  await choose("تعديل").click();
  const empty = page.getByRole("textbox", { name: "المائدة الفارغة" });
  await expect(empty).toBeFocused();
  await expect(empty).toHaveValue("بانتظار العروض");
  // الحفظ معطّل حتى يتغير النص، ويوجد في السطر وفي قائمة ⋮.
  await expect(choose("حفظ")).toBeDisabled();
  await empty.fill("الصحون جاية");
  await page.screenshot({
    path: `test-results/site-texts-edit-${info.project.name}.png`,
  });
  await open("المائدة الفارغة");
  await choose("حفظ").first().click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toEqual({ key: "table.empty", value: "الصحون جاية" });
  await expect(page.locator(".save-toast")).toContainText("تم الحفظ");
  await expect(page.getByText("(معدّل)")).toBeVisible();
  await expect(page.getByLabel(/^المائدة الفارغة/)).toHaveText("الصحون جاية");

  // نص محذوف: يُستعاد لأصله من القائمة.
  await expect(page.getByText("(محذوف)")).toBeVisible();
  await open("العبارة الختامية");
  await choose("استعادة الأصل").click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toEqual({ key: "footer.made", value: null });

  await open("المائدة الفارغة");
  await choose("حذف").click();
  await expect.poll(() => sent.length).toBe(3);
  expect(sent[2]).toEqual({ key: "table.empty", value: "" });

  // إخفاء العنوان دون مسحه ثم إظهاره.
  await open("عنوان المائدة");
  await choose("إخفاء العنوان").click();
  await expect.poll(() => sent.length).toBe(4);
  expect(sent[3]).toEqual({ key: "table.title", hidden: true });
  await expect(page.getByText("(مخفي)")).toBeVisible();
  await expect(page.getByLabel(/^عنوان المائدة \(/)).toHaveText("مائدة اليوم");
  await open("عنوان المائدة");
  await choose("إظهار العنوان").click();
  await expect.poll(() => sent.length).toBe(5);
  expect(sent[4]).toEqual({ key: "table.title", hidden: false });
  // الفقرة: عنوانها ونصها سطران في إطار واحد، ولكل منهما قائمته.
  const paragraph = page.getByRole("group", { name: "العنوان الفرعي الأول" });
  await expect(paragraph.getByLabel(/^الفقرة الأولى/)).toHaveText(
    "تصفح الأسر والمنتجات",
  );
  await open("الفقرة الأولى");
  await choose("إخفاء النص").click();
  await expect.poll(() => sent.length).toBe(6);
  expect(sent[5]).toEqual({ key: "about.p1", hidden: true });
});
