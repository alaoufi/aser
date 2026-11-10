import { test, expect } from "@playwright/test";

test("a member rates an ordered product with shiny stars and the count shows", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "c1",
          name: "عميل",
          phone: "+966500000001",
          role: "customer",
        },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/producer/status", (r) =>
    r.fulfill({ json: { state: null } }),
  );
  await page.route("**/api/orders", (r) =>
    r.fulfill({
      json: {
        orders: [
          {
            id: "o1",
            productId: "11111111-1111-4111-8111-111111111111",
            snapshot: {
              productName: "جريش",
              producerName: "أسرة",
              unit: "صحن",
              price: 20,
              offer: null,
            },
            name: "عميل",
            phone: "+966500000001",
            quantity: 1,
            meal: "lunch",
            days: 1,
            startDate: "2026-11-11",
            endDate: "2026-11-11",
            notes: "",
            status: "completed",
          },
        ],
      },
    }),
  );
  let sent: unknown;
  let view = { average: 4, count: 3, mine: null, canRate: true };
  await page.route("**/api/ratings**", async (r) => {
    if (r.request().method() === "PUT") {
      sent = r.request().postDataJSON();
      view = { ...view, average: 4.3, count: 4 };
      return r.fulfill({ json: { average: 4.3, count: 4 } });
    }
    return r.fulfill({ json: view });
  });
  await page.goto("/orders");
  const box = page.getByRole("region", { name: "تقييم المنتج" });
  await expect(
    box.getByRole("img", { name: "التقييم 4 من 5 (3 تقييم)" }),
  ).toBeVisible();
  await expect(box.getByRole("group", { name: "رأيك مهم؟" })).toBeVisible();
  await box.getByRole("radio", { name: "5 من 5" }).check();
  await box.getByRole("button", { name: "إرسال التقييم" }).click();
  await expect(box.getByText("شكرًا، تم حفظ تقييمك.")).toBeVisible();
  expect(sent).toEqual({
    kind: "product",
    target: "11111111-1111-4111-8111-111111111111",
    stars: 5,
    comment: "",
  });
  await expect(box.getByText("4.3 · 4 تقييم")).toBeVisible();
});

test("any of the five plates can be shown enlarged", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  if ((await html.getAttribute("data-template")) !== "classic") test.skip();
  const main = page.locator(".food-showcase-main img");
  await expect(main).toHaveAttribute("alt", "طبق أرز");
  await page.getByRole("button", { name: "كبّر جريش" }).click();
  await expect(main).toHaveAttribute("alt", "جريش");
  await expect(
    page.getByRole("button", { name: "كبّر طبق أرز" }),
  ).toBeVisible();
  await expect(page.locator(".food-showcase img")).toHaveCount(5);
});

test("the site version shows in the footer as four numbers", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".site-version")).toHaveText(
    /^الإصدار \d+\.\d+\.\d+\.\d+$/,
  );
});
