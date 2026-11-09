import { test, expect } from "@playwright/test";

const conversationId = "11111111-1111-4111-8111-111111111111";
test("member chats with a family in a WhatsApp-like thread that keeps history", async ({
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
  const history = [
    {
      id: "m1",
      body: "السلام عليكم، متوفر جريش اليوم؟",
      mine: true,
      createdAt: "2026-11-09T09:00:00.000Z",
    },
    {
      id: "m2",
      body: "وعليكم السلام، نعم متوفر",
      mine: false,
      createdAt: "2026-11-09T09:05:00.000Z",
    },
  ];
  let sent: unknown;
  await page.route("**/api/conversations", (r) =>
    r.fulfill({
      json: {
        conversations: [
          {
            id: conversationId,
            side: "customer",
            title: "أسرة الجريش",
            preview: "وعليكم السلام، نعم متوفر",
            lastAt: "2026-11-09T09:05:00.000Z",
            unread: 1,
          },
        ],
      },
    }),
  );
  await page.route(`**/api/conversations/${conversationId}**`, async (r) => {
    if (r.request().method() === "POST") {
      sent = r.request().postDataJSON();
      return r.fulfill({
        status: 201,
        json: {
          id: "m3",
          body: "أبي صحنين لو سمحت",
          mine: true,
          createdAt: "2026-11-09T09:06:00.000Z",
        },
      });
    }
    return r.fulfill({
      json: {
        conversation: {
          id: conversationId,
          title: "أسرة الجريش",
          side: "customer",
          producerSlug: "family-test",
        },
        messages: new URL(r.request().url()).searchParams.get("after")
          ? []
          : history,
      },
    });
  });
  await page.goto("/messages");
  const list = page.getByRole("complementary", { name: "المحادثات" });
  await expect(list.getByRole("button", { name: /أسرة الجريش/ })).toContainText(
    "1",
  );
  await list.getByRole("button", { name: /أسرة الجريش/ }).click();
  await expect(page).toHaveURL(/\/messages\?c=/);
  const thread = page.getByRole("region", { name: "المحادثة" });
  await expect(
    thread.getByText("السلام عليكم، متوفر جريش اليوم؟"),
  ).toBeVisible();
  await expect(thread.getByText("وعليكم السلام، نعم متوفر")).toBeVisible();
  await thread.getByLabel("اكتب رسالة").fill("أبي صحنين لو سمحت");
  await thread.getByRole("button", { name: "إرسال" }).click();
  await expect(thread.getByText("أبي صحنين لو سمحت")).toBeVisible();
  expect(sent).toEqual({ body: "أبي صحنين لو سمحت" });
  await expect(thread.getByLabel("اكتب رسالة")).toHaveValue("");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if ((page.viewportSize()?.width ?? 1280) <= 760) {
    await thread.getByRole("button", { name: "رجوع للمحادثات" }).click();
    await expect(page).toHaveURL(/\/messages$/);
  }
});

test("visitors are asked to sign in before messaging a family", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: null, registrationOpen: true } }),
  );
  await page.goto("/messages");
  await expect(page.getByText("يلزم تسجيل الدخول للمتابعة")).toBeVisible();
});
