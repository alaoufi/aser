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
    pattern: "dots",
    effect: "soft",
    scale: 2,
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
  const group = (name: string) => card.getByRole("group", { name });
  await expect(
    group("اللون").getByRole("radio", { name: "زعفران" }),
  ).toBeChecked();
  await expect(group("اللون").getByRole("radio")).toHaveCount(16);
  await expect(group("الزخرفة (الشكل)").getByRole("radio")).toHaveCount(16);
  // المكتبة المميزة مقفلة للهوية المجانية.
  await expect(
    group("الزخرفة (الشكل)").getByRole("radio", { name: /مشربية/ }),
  ).toBeDisabled();
  await expect(
    group("التأثير").getByRole("radio", { name: /رقائق ذهب/ }),
  ).toBeDisabled();
  await group("اللون").getByRole("radio", { name: "رمان" }).check();
  await group("الزخرفة (الشكل)")
    .getByRole("radio", { name: "نجمة إسلامية" })
    .check();
  await group("التأثير").getByRole("radio", { name: "بارز" }).check();
  await group("حجم الزخرفة").getByRole("radio", { name: "كبيرة" }).check();
  // المعاينة تتغير قبل الحفظ: لون الرمان وزخرفة وتأثير بارز، لا أبيض.
  const preview = card.getByRole("img", { name: "معاينة بطاقة الأسرة" });
  const look = await preview.evaluate((el) => {
    const c = getComputedStyle(el);
    return {
      bg: c.backgroundColor,
      image: c.backgroundImage,
      shadow: c.boxShadow,
    };
  });
  expect(look.bg).toBe("rgb(249, 230, 226)");
  expect(look.image).toContain("data:image/svg+xml");
  expect(look.shadow).not.toBe("none");
  await card.getByRole("button", { name: "حفظ الهوية" }).click();
  await expect(card.getByText(/تم حفظ هويتك ✓/)).toBeVisible();
  expect(sent).toEqual({
    palette: "pomegranate",
    pattern: "najmah",
    effect: "raised",
    scale: 3,
  });
});
