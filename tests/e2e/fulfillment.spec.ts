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
  // ترحيب الأسرة يُختبر في family-welcome.spec؛ هنا نعدّه ظاهرًا في هذه الزيارة.
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
  const where = card.getByLabel("موقع الأسرة", { exact: true });
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
  // التوصيل فقط: الموقع اختياري، ويبقى محفوظًا ليصل للمندوب.
  await pickup.uncheck();
  await expect(where).not.toHaveAttribute("required", "");
  await card.getByRole("button", { name: "حفظ طرق التسليم" }).click();
  await expect
    .poll(() => saved)
    .toEqual({
      pickup: false,
      delivery: true,
      pickupLocation: "https://maps.google.com/?q=26.33,43.97",
    });
  await where.fill("");
  await card.getByRole("button", { name: "حفظ طرق التسليم" }).click();
  await expect
    .poll(() => saved)
    .toEqual({ pickup: false, delivery: true, pickupLocation: null });
  // ولا يُحفظ دون أي طريقة.
  await delivery.uncheck();
  await card.getByRole("button", { name: "حفظ طرق التسليم" }).click();
  await expect(card.getByRole("alert")).toContainText("أو كليهما");
});

// ظهور بيانات التواصل: واتساب والجوال، كلٌّ يُحفظ فور تغييره.
test("family chooses whether customers see its WhatsApp and phone", async ({
  page,
}) => {
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
  await page.route("**/api/producer/fulfillment", (r) =>
    r.fulfill({
      json: { pickup: false, delivery: true, pickupLocation: null },
    }),
  );
  const state = {
    showPhone: true,
    showWhatsapp: true,
    phone: family.phone,
    whatsapp: null as string | null,
  };
  const sent: unknown[] = [];
  await page.route("**/api/producer/contact", async (r) => {
    if (r.request().method() === "PUT") {
      const body = r.request().postDataJSON();
      sent.push(body);
      Object.assign(state, body);
    }
    return r.fulfill({ json: state });
  });
  await page.goto("/dashboard");
  const card = page.getByRole("region", {
    name: "ظهور بيانات التواصل للعملاء",
  });
  const whatsapp = card.getByRole("checkbox", { name: /واتساب/ });
  const phone = card.getByRole("checkbox", { name: /جوال/ });
  await expect(whatsapp).toBeChecked();
  await expect(phone).toBeChecked();
  await expect(card).toContainText("واتساب على رقم جوالك");
  await phone.uncheck();
  await expect(card).toContainText("تم الحفظ ✓");
  await expect(phone).not.toBeChecked();
  await expect(whatsapp).toBeChecked();
  expect(sent).toEqual([{ showPhone: false, showWhatsapp: true }]);
});
