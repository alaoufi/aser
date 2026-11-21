import { test, expect } from "@playwright/test";

const product = (id: string, name: string) => ({
  id,
  producerId: "f1",
  producerName: "أسرة الجريش",
  producerSlug: "family-1",
  cityName: "الرياض",
  name,
  description: "وصف",
  price: 40,
  unit: "meal",
  status: "available",
  imageUrl: null,
  categoryIds: [],
  allergens: [],
  delivery: true,
  pickup: true,
});

// مقترح لك: يظهر للعضو المسجّل فقط، ولكل طبق سبب ظاهر.
test("signed-in members see suggestions with their reasons on the home page", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "u1",
          name: "عميل",
          phone: "+966500000071",
          role: "customer",
        },
        registrationOpen: true,
      },
    }),
  );
  let asked = "";
  await page.route("**/api/recommendations**", (r) => {
    asked = r.request().url();
    return r.fulfill({
      json: {
        personal: true,
        items: [
          {
            product: product("p1", "جريش بالسمن"),
            reason: "لأنك تحب أكلات نجدية",
          },
          { product: product("p2", "مرقوق"), reason: "من أسرة تعاملت معها" },
        ],
      },
    });
  });
  await page.goto("/?region=riyadh");
  const section = page.getByRole("region", { name: "مقترح لك" });
  await expect(section).toBeVisible();
  await expect(section).toContainText("حسب طلباتك وتقييماتك وما تصفحته");
  await expect(section).toContainText("لأنك تحب أكلات نجدية");
  await expect(section).toContainText("جريش بالسمن");
  await expect(section).toContainText("من أسرة تعاملت معها");
  expect(asked).toContain("region=riyadh");
});

test("visitors without an account do not get the personal section", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: null, registrationOpen: true } }),
  );
  let called = false;
  await page.route("**/api/recommendations**", (r) => {
    called = true;
    return r.fulfill({ json: { items: [], personal: false } });
  });
  await page.goto("/");
  await expect(page.locator("footer")).toBeVisible();
  await expect(page.getByRole("region", { name: "مقترح لك" })).toHaveCount(0);
  expect(called).toBe(false);
});

// طلب منطقتك في لوحة الأسرة: الأكثر طلبًا، والفرص، وما يطلبه عملاؤها.
test("families see their region demand in the dashboard", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("jdatna:family-welcome", "1");
    } catch {}
  });
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "f",
          name: "أسرة",
          phone: "+966500000072",
          role: "producer",
          familyName: "أسرة الجريش",
        },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/producer/insights", (r) =>
    r.fulfill({
      json: {
        insights: {
          regionName: "منطقة الرياض",
          popular: [{ category: "أكلات نجدية", orders: 12 }],
          opportunities: [{ category: "حلويات", orders: 7, families: 0 }],
          alsoBought: [{ category: "مخبوزات", customers: 4 }],
        },
      },
    }),
  );
  await page.goto("/dashboard");
  const card = page.getByRole("region", { name: /طلب منطقتك/ });
  await expect(card).toContainText("منطقة الرياض");
  await expect(card).toContainText("أكلات نجدية: 12 طلب");
  await expect(card).toContainText("لا تقدّمه أسرة في منطقتك");
  await expect(card).toContainText("مخبوزات: 4 من عملائك");
});
