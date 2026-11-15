import { test, expect } from "@playwright/test";

const family = {
  id: "f",
  name: "مطبخ أم سعد",
  phone: "+966500000081",
  role: "producer",
};

// هوية الأسرة: تختار لونًا يميّزها، فتأخذه بطاقتها وبطاقات منتجاتها.
test("a family picks its brand colour from the dashboard", async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("jdatna:family-welcome", "1"),
  );
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
          id: "00000000-0000-4000-8000-000000000081",
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
    r.fulfill({ json: { day: "2026-11-15", notCookingToday: false } }),
  );
  await page.route("**/api/producer/fulfillment", (r) =>
    r.fulfill({
      json: { pickup: true, delivery: false, pickupLocation: "حي" },
    }),
  );
  await page.route("**/api/producer/contact", (r) =>
    r.fulfill({
      json: {
        showPhone: true,
        showWhatsapp: true,
        phone: family.phone,
        whatsapp: null,
      },
    }),
  );
  let sent: unknown;
  const brand = {
    producerId: "00000000-0000-4000-8000-000000000081",
    palette: "saffron",
    chosen: false,
    tier: "free",
  };
  await page.route("**/api/producer/brand", (r) => {
    if (r.request().method() === "PUT") {
      sent = r.request().postDataJSON();
      Object.assign(brand, sent, { chosen: true });
    }
    return r.fulfill({ json: brand });
  });
  await page.goto("/dashboard");
  const card = page.getByRole("region", { name: "هوية الأسرة" });
  await expect(card.getByRole("radio", { name: "زعفران" })).toBeChecked();
  expect(await card.getByRole("radio").count()).toBe(8);
  await card.getByRole("radio", { name: "رمان" }).check();
  await expect(card.getByText(/تم الحفظ ✓/)).toBeVisible();
  expect(sent).toEqual({ palette: "pomegranate" });
  // المعاينة تأخذ لون الرمان، لا الأبيض.
  const bg = await card
    .getByRole("img", { name: "معاينة بطاقتك" })
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe("rgb(249, 230, 226)");
});
