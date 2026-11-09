import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

test.describe("requests on a real isolated catalog product", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database environment",
  );
  const userId = randomUUID(),
    producerId = randomUUID(),
    productId = randomUUID();
  const offerId = randomUUID(),
    receiptId = randomUUID();
  const productName = "طبق اختبار طلبات المتصفح";
  let pool: Pool | undefined,
    fixtureStarted = false;
  const dateAfter = (days: number) =>
    new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  test.beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      statement_timeout: 10000,
    });
    const name = (await pool.query("SELECT current_database() AS name")).rows[0]
      .name as string;
    expect(
      name.startsWith("jdatna_test_"),
      "Browser fixtures require isolated jdatna_test_ database",
    ).toBe(true);
    const city = (
      await pool.query("SELECT id FROM jdatna.cities ORDER BY id LIMIT 1")
    ).rows[0];
    expect(
      city,
      "Scratch migrations must include an existing city",
    ).toBeTruthy();
    fixtureStarted = true;
    const phone =
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'اختبار متصفح',$2,'producer',now())",
      [userId, phone],
    );
    await pool.query(
      "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة اختبار الطلبات',$4,$5,'approved')",
      [producerId, userId, "orders-browser-" + producerId, city.id, phone],
    );
    await pool.query(
      "INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status) VALUES($1,$2,$3,'منتج معزول لاختبار واجهة الطلب',25,'وجبة','available')",
      [productId, producerId, productName],
    );
  });
  test.afterAll(async () => {
    try {
      if (pool && fixtureStarted) {
        await pool.query("DELETE FROM jdatna.products WHERE id=$1", [
          productId,
        ]);
        await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
          producerId,
        ]);
        await pool.query("DELETE FROM jdatna.users WHERE id=$1", [userId]);
      }
    } finally {
      await pool?.end();
    }
  });
  async function session(page: Page, member = false) {
    await page.route("**/api/session", (route) =>
      route.fulfill({
        json: {
          user: member
            ? {
                id: userId,
                name: "عميل اختبار",
                phone: "+966500000001",
                role: "customer",
              }
            : null,
          registrationOpen: false,
        },
      }),
    );
  }
  async function fillGuest(page: Page) {
    const form = page.getByRole("region", { name: "طلب المنتج" });
    await form.getByLabel("الاسم", { exact: true }).fill("طالب اختبار");
    await expect(form.getByLabel("الجوال", { exact: true })).toHaveValue(
      "+966500000001",
    );
    await form.getByLabel("تاريخ البداية", { exact: true }).fill(dateAfter(2));
    return form;
  }
  test("a visitor browses the product but must verify a phone before ordering", async ({
    page,
  }) => {
    await session(page);
    let sent = 0;
    await page.route("**/api/orders", (route) => {
      sent++;
      return route.fulfill({ status: 500, json: { error: "Unexpected" } });
    });
    await page.goto(`/products/${productId}`);
    await expect(
      page.getByRole("heading", { name: productName, level: 1 }),
    ).toBeVisible();
    const form = page.getByRole("region", { name: "طلب المنتج" });
    await expect(form).toContainText("سجّل برقم جوالك لإرسال الطلب");
    await expect(
      form.getByRole("button", { name: "مراجعة الطلب قبل الإرسال" }),
    ).toHaveCount(0);
    expect(sent).toBe(0);
  });
  test("member week, month and inclusive end-date submit clear non-payment requests", async ({
    page,
  }) => {
    await session(page, true);
    const sent: Record<string, unknown>[] = [];
    await page.route("**/api/orders", (route) => {
      sent.push(route.request().postDataJSON());
      return route.fulfill({
        status: 201,
        json: { id: receiptId, status: "pending" },
      });
    });
    for (const mode of ["week", "month", "endDate"]) {
      await page.goto(`/products/${productId}`);
      const form = await fillGuest(page);
      await form
        .getByRole("combobox", { name: "الوجبة", exact: true })
        .selectOption("lunch");
      await form
        .getByRole("combobox", { name: "طريقة تحديد المدة", exact: true })
        .selectOption(mode);
      if (mode === "endDate")
        await form
          .getByLabel("تاريخ النهاية (شامل)", { exact: true })
          .fill(dateAfter(8));
      await expect(form).toContainText("لا دفع أو تجديد تلقائي");
      await form
        .getByRole("button", { name: "مراجعة الطلب قبل الإرسال" })
        .click();
      await expect(form.getByText("راجع طلبك قبل الإرسال")).toBeVisible();
      await form.getByRole("button", { name: "تأكيد وإرسال الطلب" }).click();
      const receipt = form.getByRole("status");
      await expect(receipt).toContainText(receiptId.slice(0, 8));
      await expect(receipt).toContainText("تم إرسال طلبك للأسرة المنتجة");
      await expect(receipt).toContainText("الخطوة التالية");
      await expect(
        receipt.getByRole("link", { name: "اتصال بالأسرة المنتجة" }),
      ).toHaveAttribute("href", /^tel:\+9665\d{8}$/);
      const payload = sent.at(-1)!;
      expect(payload.productId).toBe(productId);
      expect(payload.requestKey).toMatch(/^[0-9a-f-]{36}$/);
      expect(payload).not.toHaveProperty("userId");
      if (mode === "endDate") {
        expect(payload.endDate).toBe(dateAfter(8));
        expect(payload).not.toHaveProperty("days");
      } else expect(payload.days).toBe(mode === "week" ? 7 : 30);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    expect(sent).toHaveLength(3);
  });
  test("selected offer displays terms and locks its meal in the submitted payload", async ({
    page,
  }) => {
    await session(page, true);
    await page.route("**/api/offers/**", (route) =>
      route.fulfill({
        json: {
          offer: {
            id: offerId,
            productId,
            title: "عرض فطور محدد",
            price: 15,
            terms: "شرط الأسرة المنتجة الواضح",
            meal: "breakfast",
          },
        },
      }),
    );
    const sent: Record<string, unknown>[] = [];
    await page.route("**/api/orders", (route) => {
      sent.push(route.request().postDataJSON());
      return route.fulfill({
        status: 201,
        json: { id: receiptId, status: "pending" },
      });
    });
    await page.goto(`/products/${productId}?offer=${offerId}`);
    const form = await fillGuest(page);
    await expect(form).toContainText("عرض فطور محدد");
    await expect(form).toContainText("شرط الأسرة المنتجة الواضح");
    await expect(
      form.getByRole("combobox", { name: "الوجبة", exact: true }),
    ).toHaveValue("breakfast");
    await expect(
      form.getByRole("combobox", { name: "الوجبة", exact: true }),
    ).toBeDisabled();
    await form
      .getByRole("button", { name: "مراجعة الطلب قبل الإرسال" })
      .click();
    await expect(form.getByText("راجع طلبك قبل الإرسال")).toBeVisible();
    await form.getByRole("button", { name: "تأكيد وإرسال الطلب" }).click();
    await expect(form.getByRole("status")).toContainText(receiptId.slice(0, 8));
    expect(sent[0]).toMatchObject({ offerId, meal: "breakfast" });
  });
  for (const repeated of [false, true])
    test(
      repeated
        ? "repeated offer query fails closed"
        : "inaccessible offer fails closed",
      async ({ page }) => {
        await session(page, true);
        await page.route("**/api/offers/**", (route) =>
          route.fulfill({ status: 404, json: { error: "العرض غير متاح" } }),
        );
        let sent = 0;
        await page.route("**/api/orders", (route) => {
          sent++;
          return route.fulfill({
            status: 500,
            json: { error: "Unexpected submit" },
          });
        });
        await page.goto(
          `/products/${productId}?offer=${offerId}${repeated ? "&offer=" + randomUUID() : ""}`,
        );
        const form = page.getByRole("region", { name: "طلب المنتج" });
        await expect(form.getByRole("alert")).toContainText("العرض غير متاح");
        await expect(
          form.getByRole("button", { name: "مراجعة الطلب قبل الإرسال" }),
        ).toBeDisabled();
        expect(sent).toBe(0);
      },
    );
  test("member history preserves agreement pricing and reorder opens a fresh reviewed draft", async ({
    page,
  }) => {
    await session(page, true);
    let posts = 0;
    await page.route("**/api/orders", (route) => {
      if (route.request().method() !== "GET") {
        posts++;
        return route.fulfill({
          status: 500,
          json: { error: "Unexpected submit" },
        });
      }
      return route.fulfill({
        json: {
          orders: [
            {
              id: receiptId,
              productId,
              snapshot: {
                productName: "طبق قديم",
                producerName: "أسرة الاختبار",
                unit: "وجبة",
                price: 99,
                offer: { label: "عرض بالاتفاق", price: null },
              },
              name: "عميل",
              phone: "+966500000001",
              quantity: 2,
              meal: "lunch",
              days: 30,
              startDate: "2026-01-01",
              endDate: "2026-01-30",
              notes: "ملاحظة قديمة",
              status: "completed",
            },
          ],
        },
      });
    });
    await page.route("**/api/orders/*/reorder", (route) =>
      route.fulfill({
        json: {
          productId,
          productName,
          quantity: 2,
          meal: "lunch",
          days: 30,
          notes: "ملاحظة قديمة",
        },
      }),
    );
    await page.goto("/orders");
    await expect(page.locator("article")).toContainText(
      "السعر عند الإرسال: بالاتفاق",
    );
    await expect(page.locator("article")).not.toContainText("99 ر.س");
    await page
      .getByRole("button", { name: "إعداد طلب جديد من المنتج" })
      .click();
    const form = page.getByRole("region", { name: "طلب المنتج" });
    await expect(
      form.getByRole("heading", { name: "طلب " + productName }),
    ).toBeVisible();
    await expect(form.getByLabel("تاريخ البداية", { exact: true })).toHaveValue(
      "",
    );
    await expect(form.getByLabel("عدد الأيام", { exact: true })).toHaveValue(
      "30",
    );
    await expect(
      form.getByRole("combobox", { name: "الوجبة", exact: true }),
    ).toHaveValue("lunch");
    await expect(
      page.getByRole("link", {
        name: "راجع المنتج والسعر الحالي قبل إرسال المسودة",
      }),
    ).toHaveAttribute("href", `/products/${productId}`);
    await expect(form).not.toContainText("عرض بالاتفاق");
    expect(posts).toBe(0);
  });
});
