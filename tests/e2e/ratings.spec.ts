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
  const oath =
    "أقسم بالله العلي العظيم أني تعاملت مع هذه الأسرة وتقييمي صادق وما قلت إلا الصدق";
  let view: {
    average: number;
    count: number;
    mine: { stars: number; comment: string } | null;
    canRate: boolean;
    oath: string;
    rated?: string;
  } = { average: 4, count: 3, mine: null, canRate: true, oath };
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
  // لا يُرسل التقييم قبل الموافقة على القسم.
  const send = box.getByRole("button", { name: "إرسال التقييم" });
  await expect(send).toBeDisabled();
  await box.getByRole("checkbox", { name: oath }).check();
  await send.click();
  await expect(box.getByText("شكرًا، تم حفظ تقييمك.")).toBeVisible();
  expect(sent).toEqual({
    kind: "product",
    target: "11111111-1111-4111-8111-111111111111",
    stars: 5,
    comment: "",
    oath: true,
  });
  await expect(box.getByText("4.3 · 4 تقييم")).toBeVisible();
  // تقييم واحد لهذا الطلب: يختفي النموذج بعد الحفظ.
  await expect(box.getByRole("button", { name: "إرسال التقييم" })).toHaveCount(
    0,
  );
  await expect(box.getByRole("group", { name: "رأيك مهم؟" })).toHaveCount(0);
  // زيارة لاحقة بلا تعامل جديد: «سبق لك تقييم هذا المنتج» بدل زر التقييم.
  view = {
    ...view,
    canRate: false,
    mine: { stars: 5, comment: "" },
    rated: "سبق لك تقييم هذا المنتج",
  };
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "تقييم المنتج" })
      .getByText("✓ سبق لك تقييم هذا المنتج (5 من 5)"),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "تقييم المنتج" }).getByRole("radio"),
  ).toHaveCount(0);
});

// صحون آخر الإضافات (قرار المالك 2026-11-26): أي صحن يُعرض مكبّرًا داخل القوس، ويبقى في مكانه.
test("any of the plates can be shown enlarged", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  if ((await html.getAttribute("data-template")) !== "classic") test.skip();
  const main = page.locator(".food-showcase-main img");
  const strip = page.getByRole("group", { name: "آخر الإضافات" });
  const plates = strip.getByRole("button");
  await expect(plates).toHaveCount(4);
  // الأول (الأحدث) مختار عند الدخول.
  await expect(plates.first()).toHaveAttribute("aria-pressed", "true");
  const third = plates.nth(2);
  const name = (await third.getAttribute("aria-label"))!.replace(/^اعرض /, "");
  await third.click();
  await expect(main).toHaveAttribute("alt", name);
  await expect(third).toHaveAttribute("aria-pressed", "true");
  await expect(plates).toHaveCount(4);
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
