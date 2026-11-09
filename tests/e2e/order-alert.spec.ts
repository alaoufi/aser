import { test, expect, type Page } from "@playwright/test";

const producer = {
  id: "family-alert-user",
  name: "أسرة التنبيه",
  phone: "+966500000009",
  role: "producer",
};
const pendingId = "00000000-0000-4000-8000-0000000000a1";
const preparingId = "00000000-0000-4000-8000-0000000000a2";
const snapshot = {
  productName: "جريش بالدجاج",
  producerName: "أسرة التنبيه",
  unit: "صحن",
  price: 30,
  offer: null,
};
const order = (id: string, status: string, isNew = false) => ({
  id,
  productId: "00000000-0000-4000-8000-0000000000b1",
  snapshot,
  name: "أم محمد",
  phone: "+966511111111",
  quantity: 2,
  meal: "lunch",
  days: 1,
  startDate: "2026-11-12",
  endDate: "2026-11-12",
  notes: "بدون حار",
  status,
  isNew,
});

async function mockProducer(page: Page) {
  const state = { acknowledged: [] as string[], patches: [] as unknown[] };
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: producer, registrationOpen: true } }),
  );
  await page.route("**/api/producer/orders/alerts", async (r) => {
    if (r.request().method() === "POST") {
      state.acknowledged.push(...r.request().postDataJSON().ids);
      return r.fulfill({ json: { seen: r.request().postDataJSON().ids } });
    }
    const unseen = state.acknowledged.includes(pendingId)
      ? []
      : [
          {
            id: pendingId,
            productName: snapshot.productName,
            name: "أم محمد",
            quantity: 2,
            unit: "صحن",
            meal: "lunch",
            startDate: "2026-11-12",
          },
        ];
    return r.fulfill({ json: { alerts: unseen, pending: 1 } });
  });
  await page.route("**/api/producer/orders", async (r) => {
    if (r.request().method() === "PATCH") {
      state.patches.push(r.request().postDataJSON());
      return r.fulfill({ json: { id: pendingId, status: "accepted" } });
    }
    return r.fulfill({
      json: {
        orders: [
          order(pendingId, "pending", !state.acknowledged.includes(pendingId)),
          order(preparingId, "preparing"),
        ],
      },
    });
  });
  return state;
}

test("family sees a new-order popup and moves the order through fulfillment", async ({
  page,
}) => {
  const state = await mockProducer(page);
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "لديك طلب جديد" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("جريش بالدجاج");
  await expect(dialog).toContainText("أم محمد");
  await expect(page).toHaveTitle(/^\(1\) /);

  await dialog.getByRole("link", { name: "عرض الطلب والرد عليه" }).click();
  await expect(page).toHaveURL(/\/dashboard\/orders$/);
  await expect.poll(() => state.acknowledged).toEqual([pendingId]);
  await expect(dialog).toBeHidden();

  await expect(
    page.getByRole("heading", { name: /طلبات جديدة/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /قيد التنفيذ/ }),
  ).toBeVisible();
  const steps = page.getByRole("list", { name: "مراحل تنفيذ الطلب" });
  await expect(steps).toHaveCount(2);
  await expect(page.getByRole("button", { name: "الطلب جاهز" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "واتساب" }).first(),
  ).toHaveAttribute("href", /^https:\/\/wa\.me\/966511111111\?text=/);

  await page.getByRole("button", { name: "قبول الطلب" }).click();
  await expect
    .poll(() => state.patches)
    .toEqual([{ id: pendingId, status: "accepted" }]);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
    "page must not overflow horizontally",
  ).toBe(true);
});

test("closing the popup with لاحقًا acknowledges it without leaving the page", async ({
  page,
}) => {
  const state = await mockProducer(page);
  await page.goto("/about");
  const dialog = page.getByRole("dialog", { name: "لديك طلب جديد" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "لاحقًا" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/about$/);
  await expect.poll(() => state.acknowledged).toEqual([pendingId]);
});

test("customers never poll family order alerts", async ({ page }) => {
  let polled = false;
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: { ...producer, role: "customer" },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/producer/orders/alerts", (r) => {
    polled = true;
    return r.fulfill({ json: { alerts: [], pending: 0 } });
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(polled).toBe(false);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
