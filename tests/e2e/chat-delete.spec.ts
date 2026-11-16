import { test, expect, type Page } from "@playwright/test";

const id = "44444444-4444-4444-8444-444444444444";
const conversation = {
  id,
  title: "أسرة الجريش",
  side: "customer",
  producerSlug: "family-test",
  blocked: false,
  blockedByMe: false,
};

async function signedIn(page: Page) {
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
}

test("deleting a conversation asks first, then removes it for both sides", async ({
  page,
}) => {
  await signedIn(page);
  let deleted = false;
  let deletes = 0;
  await page.route("**/api/conversations", (r) =>
    r.fulfill({
      json: {
        conversations: deleted
          ? []
          : [
              {
                id,
                side: "customer",
                title: "أسرة الجريش",
                preview: "مرحبا",
                lastAt: "2026-11-09T09:05:00.000Z",
                unread: 0,
              },
            ],
      },
    }),
  );
  await page.route(`**/api/conversations/${id}**`, (r) => {
    if (r.request().method() === "DELETE") {
      deletes++;
      deleted = true;
      return r.fulfill({ json: { deleted: true } });
    }
    return r.fulfill({
      json: {
        conversation,
        messages: [
          {
            id: "m1",
            body: "مرحبا",
            mine: false,
            createdAt: "2026-11-09T09:05:00.000Z",
            voiceMs: null,
          },
        ],
      },
    });
  });
  await page.goto(`/messages?c=${id}`);
  const thread = page.getByRole("region", { name: "المحادثة" });
  await thread.getByLabel("خيارات المحادثة").click();
  await thread.getByRole("button", { name: "حذف المحادثة" }).click();
  const confirm = page.getByRole("alertdialog", {
    name: "حذف المحادثة مع أسرة الجريش؟",
  });
  await expect(confirm).toContainText("من عندك وعند أسرة الجريش");
  await expect(confirm).toContainText("لدى إدارة المنصة");
  await confirm.getByRole("button", { name: "تراجع" }).click();
  await expect(confirm).toHaveCount(0);
  expect(deletes).toBe(0);

  await thread.getByLabel("خيارات المحادثة").click();
  await thread.getByRole("button", { name: "حذف المحادثة" }).click();
  await page.getByRole("button", { name: "نعم، احذف المحادثة" }).click();
  await expect(page).toHaveURL(/\/messages$/);
  await expect(
    page.getByText("حُذفت المحادثة من عندك وعند الطرف الآخر."),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "المحادثات" }).getByRole("button", {
      name: /أسرة الجريش/,
    }),
  ).toHaveCount(0);
  expect(deletes).toBe(1);
});

test("a sent message shows instantly before the server answers", async ({
  page,
}) => {
  await signedIn(page);
  await page.route("**/api/conversations", (r) =>
    r.fulfill({ json: { conversations: [] } }),
  );
  let release: () => void = () => {};
  const answered = new Promise<void>((done) => (release = done));
  await page.route(`**/api/conversations/${id}**`, async (r) => {
    if (r.request().method() === "POST") {
      await answered;
      return r.fulfill({
        status: 201,
        json: {
          id: "m9",
          body: "أبي صحنين",
          mine: true,
          createdAt: new Date().toISOString(),
          voiceMs: null,
        },
      });
    }
    return r.fulfill({ json: { conversation, messages: [] } });
  });
  await page.goto(`/messages?c=${id}`);
  const thread = page.getByRole("region", { name: "المحادثة" });
  await thread.getByLabel("اكتب رسالة").fill("أبي صحنين");
  await thread.getByRole("button", { name: "إرسال" }).click();
  // قبل رد الخادم: الرسالة ظاهرة بعلامة «جارٍ الإرسال» والحقل فارغ.
  await expect(thread.getByText("أبي صحنين")).toBeVisible();
  await expect(thread.getByRole("img", { name: "جارٍ الإرسال" })).toBeVisible();
  await expect(thread.getByLabel("اكتب رسالة")).toHaveValue("");
  release();
  await expect(thread.getByRole("img", { name: "جارٍ الإرسال" })).toHaveCount(
    0,
  );
  await expect(thread.getByText("أبي صحنين")).toHaveCount(1);
});

test("a conversation the other side deleted says so instead of failing", async ({
  page,
}) => {
  await signedIn(page);
  await page.route("**/api/conversations", (r) =>
    r.fulfill({ json: { conversations: [] } }),
  );
  let gone = false;
  await page.route(`**/api/conversations/${id}**`, (r) =>
    gone
      ? r.fulfill({ status: 404, json: { error: "المحادثة غير موجودة" } })
      : r.fulfill({ json: { conversation, messages: [] } }),
  );
  await page.goto(`/messages?c=${id}`);
  const thread = page.getByRole("region", { name: "المحادثة" });
  await expect(thread.getByLabel("اكتب رسالة")).toBeVisible();
  gone = true;
  // التحديث التالي (عند العودة للصفحة) يكتشف الحذف.
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(thread.getByText("حُذفت هذه المحادثة.")).toBeVisible();
  await expect(thread.getByLabel("اكتب رسالة")).toHaveCount(0);
});
