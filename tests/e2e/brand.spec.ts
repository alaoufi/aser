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
    palette: "c4-7",
    pattern: "dots-g-2-0",
    effect: "soft",
    scale: 2,
    chosen: false,
    tier: "free",
    // أسرة في نفس المدينة تستخدم «رمان زاهٍ معتدل» مع «سدو».
    taken: [{ palette: "c0-10", motif: "sadu" }],
  };
  await page.route("**/api/producer/brand", (r) => {
    if (r.request().method() === "PUT") {
      sent = r.request().postDataJSON();
      Object.assign(brand, sent, { chosen: true });
    }
    return r.fulfill({ json: brand });
  });
  // «الألوان والزخرفة» في تبويب «هوية الأسرة».
  await page.goto("/dashboard/identity#brand");
  const card = page.getByRole("region", { name: "الألوان والزخرفة" });
  const group = (name: string) =>
    card.getByRole("group", { name, exact: true });
  // مئات التدرجات: 24 عائلة لون، ولكل عائلة 12 درجة.
  await expect(
    card.getByRole("radiogroup", { name: "عائلة اللون" }).getByRole("radio"),
  ).toHaveCount(24);
  await expect(group("اللون").locator("input[type=radio]:checked")).toHaveCount(
    1,
  );
  await card.getByRole("radio", { name: "رمان", exact: true }).click();
  await expect(group("اللون").locator("input[type=radio]")).toHaveCount(12);
  await group("اللون").getByRole("radio", { name: "رمان زاهٍ معتدل" }).check();
  // الزخرفة المستخدمة بنفس اللون في المدينة معطلة، والمميز مقفل.
  const motifs = group("الزخرفة (شكل الخلفية)");
  await expect(motifs.getByRole("radio", { name: /سدو/ })).toBeDisabled();
  await expect(motifs.getByText("مستخدمة في مدينتك")).toBeVisible();
  await expect(motifs.getByRole("radio", { name: /مشربية/ })).toBeDisabled();
  await expect(
    group("ألوان متدرجة (المكتبة المميزة)").getByRole("radio").first(),
  ).toBeDisabled();
  await motifs.getByRole("radio", { name: /نجمة ثمانية/ }).check();
  await group("الترتيب").getByRole("radio", { name: "متداخل" }).check();
  await group("سماكة الخط").getByRole("radio", { name: "رفيع" }).check();
  await group("الاتجاه").getByRole("radio", { name: "مائل" }).check();
  await group("التأثير").getByRole("radio", { name: "بارز" }).check();
  await group("حجم الزخرفة").getByRole("radio", { name: "كبيرة" }).check();
  const preview = card.getByRole("img", { name: "معاينة بطاقة الأسرة" });
  const look = await preview.evaluate((el) => {
    const c = getComputedStyle(el);
    return { image: c.backgroundImage, shadow: c.boxShadow };
  });
  expect(look.image).toContain("data:image/svg+xml");
  expect(look.shadow).not.toBe("none");
  await card.getByRole("button", { name: "حفظ الهوية" }).click();
  await expect(card.getByText(/تم حفظ هويتك ✓/)).toBeVisible();
  const chosen = sent as { palette: string; pattern: string };
  expect(chosen.palette).toBe("c0-10");
  expect(sent).toMatchObject({
    pattern: "najmah-s-1-45",
    effect: "raised",
    scale: 3,
  });
});
