import { test, expect } from "@playwright/test";

test("admin edits, deletes and restores visible site texts", async ({
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
  await page.goto("/admin");
  await page.getByRole("button", { name: "نصوص الموقع", exact: true }).click();
  const empty = page.getByLabel("المائدة الفارغة");
  await expect(empty).toHaveValue("بانتظار العروض");
  await expect(
    page.getByRole("button", { name: "حفظ «المائدة الفارغة»" }),
  ).toBeDisabled();
  await empty.fill("الصحون جاية");
  await page.getByRole("button", { name: "حفظ «المائدة الفارغة»" }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toEqual({ key: "table.empty", value: "الصحون جاية" });
  // كل حفظ يُظهر «تم الحفظ» أسفل الشاشة.
  await expect(page.locator(".save-toast")).toContainText("تم الحفظ");
  await expect(page.getByText("(معدّل)")).toBeVisible();

  // نص محذوف: يُستعاد لأصله.
  await expect(page.getByText("(محذوف)")).toBeVisible();
  await page.getByRole("button", { name: "استعادة الأصل" }).last().click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toEqual({ key: "footer.made", value: null });

  await page.getByRole("button", { name: "حذف «المائدة الفارغة»" }).click();
  await expect.poll(() => sent.length).toBe(3);
  expect(sent[2]).toEqual({ key: "table.empty", value: "" });

  // إخفاء العنوان أو النص دون مسحه، ثم إظهاره.
  // المائدة: عنوانها ونصها في بطاقة واحدة بخياري الإخفاء.
  const table = page.getByRole("group", { name: "إخفاء عنوان المائدة" });
  await expect(
    table.getByRole("checkbox", { name: "إخفاء النص" }),
  ).toBeVisible();
  await table.getByRole("checkbox", { name: "إخفاء العنوان" }).check();
  await expect.poll(() => sent.length).toBe(4);
  expect(sent[3]).toEqual({ key: "table.title", hidden: true });
  await expect(page.getByText("(مخفي)")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: /^عنوان المائدة/ }),
  ).toHaveValue("مائدة اليوم");
  await table.getByRole("checkbox", { name: "إخفاء العنوان" }).uncheck();
  await expect.poll(() => sent.length).toBe(5);
  expect(sent[4]).toEqual({ key: "table.title", hidden: false });
  // الفقرة: «إخفاء العنوان» و«إخفاء النص» متجاوران أعلى بطاقتها.
  const paragraph = page.getByRole("group", {
    name: "إخفاء العنوان الفرعي الأول",
  });
  await paragraph.getByRole("checkbox", { name: "إخفاء النص" }).check();
  await expect.poll(() => sent.length).toBe(6);
  expect(sent[5]).toEqual({ key: "about.p1", hidden: true });
  await expect(
    paragraph.getByRole("checkbox", { name: "إخفاء العنوان" }),
  ).not.toBeChecked();
  await expect(page.getByLabel("الفقرة الأولى")).toHaveValue(
    "تصفح الأسر والمنتجات",
  );
});
