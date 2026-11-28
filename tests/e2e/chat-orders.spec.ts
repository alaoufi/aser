import { test, expect, type Page } from "@playwright/test";

/**
 * الطلب داخل المحادثة (قرار المالك 2026-11-27): زر «اطلب» للعميل، و«موافقة وإتمام» للأسرة،
 * وعدّاد مهلة الإلغاء (١٠ دقائق)، والإلغاء بالاتفاق بعدها. الخادم مُحاكى؛ منطقه في tests/chat-orders.test.ts.
 */
const id = "44444444-4444-4444-8444-444444444444";
const orderId = "55555555-5555-4555-8555-555555555555";
const product = "66666666-6666-4666-8666-666666666666";

async function setup(page: Page, side: "customer" | "producer") {
  await page.addInitScript(() =>
    sessionStorage.setItem("jdatna:family-welcome", "1"),
  );
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: side === "customer" ? "c1" : "f1",
          name: side === "customer" ? "عميل" : "صاحبة الأسرة",
          phone: "+966500000001",
          role: side === "customer" ? "customer" : "producer",
        },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/producer/status", (r) =>
    r.fulfill({ json: { state: null } }),
  );
  await page.route("**/api/conversations", (r) =>
    r.fulfill({ json: { conversations: [] } }),
  );
  await page.route(`**/api/conversations/${id}**`, (r) =>
    r.fulfill({
      json: {
        conversation: {
          id,
          title: side === "customer" ? "أسرة الكليجا" : "عميل",
          side,
          kind: side === "customer" ? "family" : "customer",
          producerSlug: "kleija",
        },
        messages: [],
      },
    }),
  );
}

const order = (over: Record<string, unknown>) => ({
  id: orderId,
  productName: "كليجا",
  unit: "box",
  price: 30,
  quantity: 2,
  notes: "بدون سمسم",
  status: "pending",
  createdAt: new Date().toISOString(),
  completedAt: null,
  cancelRequestedAt: null,
  cancelRequestedByMe: false,
  cancelUntil: null,
  actions: [],
  ...over,
});

test("the customer orders from the chat: product, quantity and a note", async ({
  page,
}) => {
  await setup(page, "customer");
  let posted: unknown;
  await page.route(`**/api/conversations/${id}/orders`, (r) => {
    if (r.request().method() === "POST") {
      posted = r.request().postDataJSON();
      return r.fulfill({
        status: 201,
        json: {
          side: "customer",
          products: [{ id: product, name: "كليجا", unit: "box", price: 30 }],
          orders: [order({ actions: ["cancel"] })],
        },
      });
    }
    return r.fulfill({
      json: {
        side: "customer",
        products: [{ id: product, name: "كليجا", unit: "box", price: 30 }],
        orders: [],
      },
    });
  });
  await page.goto(`/messages?c=${id}`);
  const bar = page.getByRole("region", { name: "الطلبات في هذه المحادثة" });
  await bar.getByRole("button", { name: /اطلب من هذه المحادثة/ }).click();
  await bar.getByLabel("الكمية").fill("2");
  await bar.getByLabel("ملاحظة (اختياري)").fill("بدون سمسم");
  await bar.getByRole("button", { name: "إرسال الطلب" }).click();
  await expect(bar.getByText("كليجا × 2")).toBeVisible();
  await expect(bar.getByText("بانتظار موافقة الأسرة")).toBeVisible();
  await expect(bar.getByRole("button", { name: "إلغاء الطلب" })).toBeVisible();
  expect(posted).toEqual({
    productId: product,
    quantity: 2,
    notes: "بدون سمسم",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("the family approves and completes, then sees the 10-minute cancel window", async ({
  page,
}) => {
  await setup(page, "producer");
  let action: unknown;
  await page.route(`**/api/conversations/${id}/orders`, (r) => {
    if (r.request().method() === "POST") {
      action = r.request().postDataJSON();
      return r.fulfill({
        status: 201,
        json: {
          side: "producer",
          products: [],
          orders: [
            order({
              status: "completed",
              completedAt: new Date().toISOString(),
              cancelUntil: new Date(Date.now() + 10 * 60_000).toISOString(),
              actions: ["cancel"],
            }),
          ],
        },
      });
    }
    return r.fulfill({
      json: {
        side: "producer",
        products: [],
        orders: [order({ actions: ["complete", "decline"] })],
      },
    });
  });
  await page.goto(`/messages?c=${id}`);
  const bar = page.getByRole("region", { name: "الطلبات في هذه المحادثة" });
  await expect(bar.getByRole("button", { name: /اطلب/ })).toHaveCount(0);
  await bar.getByRole("button", { name: "موافقة وإتمام" }).click();
  expect(action).toEqual({ orderId, action: "complete" });
  await expect(bar.getByText("منفّذ", { exact: true })).toBeVisible();
  await expect(bar.getByText(/يمكن الإلغاء خلال (9:5\d|10:00)/)).toBeVisible();
});

test("after the window, a cancel request waits for the other side to agree", async ({
  page,
}) => {
  await setup(page, "producer");
  await page.route(`**/api/conversations/${id}/orders`, (r) =>
    r.fulfill({
      json: {
        side: "producer",
        products: [],
        orders: [
          order({
            status: "completed",
            completedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
            cancelRequestedAt: new Date().toISOString(),
            actions: ["agree-cancel", "keep"],
          }),
        ],
      },
    }),
  );
  await page.goto(`/messages?c=${id}`);
  const bar = page.getByRole("region", { name: "الطلبات في هذه المحادثة" });
  await expect(bar.getByText("الطرف الآخر يطلب إلغاء الطلب.")).toBeVisible();
  await expect(
    bar.getByRole("button", { name: "موافقة على الإلغاء" }),
  ).toBeVisible();
  await expect(bar.getByRole("button", { name: "إبقاء الطلب" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "إلغاء الطلب" })).toHaveCount(0);
});
