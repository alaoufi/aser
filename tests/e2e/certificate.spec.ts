import { test, expect, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("jdatna:family-welcome", "1");
    } catch {}
  });
});

async function family(page: Page, certificate: unknown, total: number) {
  const user = {
    id: "cert-family",
    name: "مطبخ أم سعد",
    phone: "+966500000041",
    role: "producer",
  };
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user, registrationOpen: false } }),
  );
  await page.route("**/api/producer/status", (r) =>
    r.fulfill({ json: { state: null, slug: "um-saad" } }),
  );
  await page.route("**/api/producer/profile", (r) =>
    r.fulfill({
      json: {
        profile: { name: user.name, phone: user.phone, status: "approved" },
        categories: [],
        cities: [],
      },
    }),
  );
  await page.route("**/api/producer/certificate", (r) =>
    r.fulfill({
      json: {
        certificate,
        progress: { total, allFive: true, needed: 10 },
        how: "تصدر شهادة «أسرة مميزة» تلقائيًا عند حصول أسرتك على 10 تقييمات كلها 5 نجوم.",
      },
    }),
  );
}

test("a family sees its progress toward the distinguished-family certificate", async ({
  page,
}) => {
  await family(page, null, 7);
  await page.goto("/dashboard");
  const card = page.getByRole("region", { name: /شهادة «أسرة مميزة»/ });
  await expect(card).toContainText("7 من 10");
  await expect(card).toContainText("كلها 5 نجوم");
  await expect(card.getByRole("link")).toHaveCount(0);
});

test("a family with a certificate opens it from its dashboard", async ({
  page,
}) => {
  const id = "33333333-3333-4333-8333-333333333333";
  await family(page, { id, issuedAt: "2026-11-11T08:00:00.000Z" }, 10);
  await page.goto("/dashboard");
  const card = page.getByRole("region", { name: /شهادة «أسرة مميزة»/ });
  await expect(card).toContainText("مبروك");
  await expect(
    card.getByRole("link", { name: "عرض الشهادة وتحميلها" }),
  ).toHaveAttribute("href", `/certificates/${id}`);
});
