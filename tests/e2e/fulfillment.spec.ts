import { test, expect } from "@playwright/test";

const family = {
  id: "fulfil-family",
  name: "أسرة التسليم",
  phone: "+966500000001",
  role: "producer",
};
// طرق التسليم في لوحة الأسرة: تسليم مباشر بموقع، أو توصيل، أو كلاهما.
test("family chooses pickup and delivery from its dashboard and must give a pickup location", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: family, registrationOpen: true } }),
  );
  await page.route("**/api/producer/status", (r) =>
    r.fulfill({
      json: { state: { key: "active", label: "نشط", detail: "حسابك نشط." } },
    }),
  );
  await page.route("**/api/producer/profile", (r) =>
    r.fulfill({
      json: {
        profile: {
          id: "00000000-0000-4000-8000-000000000021",
          name: family.name,
          cityId: "c",
          categoryIds: [],
          pickup: true,
          delivery: false,
        },
        categories: [],
        cities: [],
      },
    }),
  );
  await page.route("**/api/producer/availability", (r) =>
    r.fulfill({ json: { day: "2026-11-14", notCookingToday: false } }),
  );
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/producer/fulfillment", async (r) => {
    if (r.request().method() === "PUT") {
      saved = r.request().postDataJSON();
      return r.fulfill({ json: saved });
    }
    return r.fulfill({
      json: { pickup: true, delivery: false, pickupLocation: null },
    });
  });
  await page.goto("/dashboard");
  const card = page.getByRole("region", { name: "طرق التسليم" });
  const pickup = card.getByRole("checkbox", { name: /تسليم مباشر/ });
  const delivery = card.getByRole("checkbox", { name: /توصيل/ });
  await expect(pickup).toBeChecked();
  await expect(delivery).not.toBeChecked();
  const where = card.getByLabel("موقع التسليم المباشر", { exact: true });
  await expect(where).toHaveAttribute("required", "");
  await where.fill("https://maps.google.com/?q=26.33,43.97");
  await delivery.check();
  await card.getByRole("button", { name: "حفظ طرق التسليم" }).click();
  await expect(card).toContainText("تم حفظ طرق التسليم ✓");
  expect(saved).toEqual({
    pickup: true,
    delivery: true,
    pickupLocation: "https://maps.google.com/?q=26.33,43.97",
  });
  // التوصيل فقط: لا حاجة لموقع التسليم.
  await pickup.uncheck();
  await expect(where).toHaveCount(0);
  await card.getByRole("button", { name: "حفظ طرق التسليم" }).click();
  await expect
    .poll(() => saved)
    .toEqual({
      pickup: false,
      delivery: true,
      pickupLocation: null,
    });
  // ولا يُحفظ دون أي طريقة.
  await delivery.uncheck();
  await card.getByRole("button", { name: "حفظ طرق التسليم" }).click();
  await expect(card.getByRole("alert")).toContainText("أو كليهما");
});
