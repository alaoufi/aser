import { test, expect, type Page } from "@playwright/test";

const member = {
  id: "c1",
  name: "عميل المتجر",
  phone: "+966500000001",
  role: "customer",
  permissions: [],
};
const signedIn = (page: Page) =>
  page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: member, registrationOpen: true } }),
  );

test("store pages: support, account deletion and app verification files are public", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const footer = page.locator("footer");
  // الدعم في التذييل البني، وحذف الحساب داخل الحساب لا في التذييل.
  await expect(footer.getByRole("link", { name: "حذف الحساب" })).toHaveCount(0);
  await expect(
    footer.getByRole("link", { name: "الدعم والتواصل" }),
  ).toHaveAttribute("href", "/support");
  await page.goto("/support");
  await expect(
    page.getByRole("heading", { name: "الدعم والتواصل", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "الإبلاغ عن محتوى أو مستخدم" }),
  ).toBeVisible();
  await expect(page.getByText("0500785596")).toBeVisible();
  await page.goto("/account/delete");
  await expect(
    page.getByRole("heading", { name: "حذف الحساب", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "سجّل الدخول" })).toBeVisible();
  expect(
    await (await request.get("/.well-known/assetlinks.json")).json(),
  ).toEqual(expect.any(Array));
  const aasa = await (
    await request.get("/.well-known/apple-app-site-association")
  ).json();
  expect(aasa.applinks).toBeTruthy();
});

test("a member deletes their account from inside the app after typing the confirmation", async ({
  page,
}) => {
  await signedIn(page);
  let body: unknown;
  await page.route("**/api/account/delete", async (r) => {
    body = r.request().postDataJSON();
    await r.fulfill({ json: { deleted: true } });
  });
  await page.goto("/account/delete");
  const button = page.getByRole("button", { name: "حذف حسابي نهائيًا" });
  await expect(button).toBeDisabled();
  await page.getByLabel("اكتب «حذف حسابي» للتأكيد").fill("حذف حسابي");
  page.once("dialog", (d) => d.accept());
  await button.click();
  await expect(page.getByText("حُذف حسابك نهائيًا")).toBeVisible();
  expect(body).toEqual({ confirm: "حذف حسابي" });
});

test("a conversation can be reported and blocked from its options menu", async ({
  page,
}) => {
  await signedIn(page);
  const id = "22222222-2222-4222-8222-222222222222";
  const patches: unknown[] = [];
  await page.route("**/api/conversations", (r) =>
    r.fulfill({ json: { conversations: [] } }),
  );
  await page.route(`**/api/conversations/${id}**`, async (r) => {
    if (r.request().method() === "PATCH") {
      const b = r.request().postDataJSON();
      patches.push(b);
      return r.fulfill({
        json:
          b.action === "report"
            ? {
                reported: true,
                blocked: Boolean(b.block),
                blockedByMe: Boolean(b.block),
              }
            : { reported: false, blocked: true, blockedByMe: true },
      });
    }
    return r.fulfill({
      json: {
        conversation: {
          id,
          title: "أسرة مزعجة",
          side: "customer",
          producerSlug: "family-x",
          blocked: false,
          blockedByMe: false,
        },
        messages: [],
      },
    });
  });
  await page.goto(`/messages?c=${id}`);
  await page.getByLabel("خيارات المحادثة").click();
  await page.getByRole("button", { name: "إبلاغ عن المحادثة" }).click();
  const form = page.getByRole("form", { name: "إبلاغ عن المحادثة" });
  await form.getByLabel("سبب البلاغ").fill("رسائل مزعجة متكررة");
  await form.getByRole("button", { name: "إرسال البلاغ" }).click();
  await expect(page.getByText("وصل بلاغك للإدارة")).toBeVisible();
  expect(patches[0]).toEqual({
    action: "report",
    reason: "رسائل مزعجة متكررة",
    block: true,
  });
  await expect(page.getByText(/حظرت هذه المحادثة/)).toBeVisible();
  await expect(page.getByLabel("اكتب رسالة")).toHaveCount(0);
});

test("an empty today's table shows a bouquet waiting for offers", async ({
  page,
}) => {
  await page.goto("/");
  const table = page.getByRole("region", { name: "مائدة اليوم" });
  await expect(table.locator(".table-bouquet")).toBeVisible();
  await expect(table).toContainText("بانتظار العروض");
});

test("inside my account, deleting takes three confirmations and can be cancelled", async ({
  page,
}) => {
  await signedIn(page);
  await page.route("**/api/orders", (r) => r.fulfill({ json: { orders: [] } }));
  let deleted = 0;
  await page.route("**/api/account/delete", async (r) => {
    deleted++;
    await r.fulfill({ json: { deleted: true } });
  });
  await page.goto("/orders");
  await page.getByRole("button", { name: "حذف حسابي" }).click();
  const warn = page.getByRole("alertdialog", { name: "هل تريد حذف حسابك؟" });
  await expect(warn).toContainText("تبقى المحادثات فقط");
  await warn.getByRole("button", { name: "تراجع، أبقِ حسابي" }).click();
  await expect(warn).toHaveCount(0);

  await page.getByRole("button", { name: "حذف حسابي" }).click();
  await page.getByRole("button", { name: "نعم، أريد الحذف" }).click();
  await page.getByLabel("اكتب «حذف حسابي» للتأكيد").fill("حذف حسابي");
  // رفض التأكيد الأخير لا يحذف.
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "حذف حسابي نهائيًا" }).click();
  await expect.poll(() => deleted).toBe(0);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "حذف حسابي نهائيًا" }).click();
  await expect(page.getByText("حُذف حسابك نهائيًا")).toBeVisible();
  expect(deleted).toBe(1);
});
