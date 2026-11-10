import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("jdatna:family-welcome", "1");
    } catch {}
  });
});

test("a new message pops a strong alert, shows the unread badge and opens the conversation", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "member-1",
          name: "عضو",
          phone: "+966500000010",
          role: "customer",
          permissions: [],
        },
        registrationOpen: true,
      },
    }),
  );
  let unread = {
    total: 2,
    conversations: [
      {
        id: "00000000-0000-4000-8000-0000000000c1",
        title: "مطبخ أم محمد",
        preview: "الجريش جاهز، متى تستلم؟",
        unread: 2,
        lastAt: "2026-11-10T12:00:00Z",
      },
    ],
  };
  await page.route("**/api/conversations/unread", (r) =>
    r.fulfill({ json: unread }),
  );
  await page.goto("/");

  const alert = page.getByRole("dialog", { name: "لديك 2 رسائل جديدة" });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("مطبخ أم محمد");
  await expect(alert).toContainText("الجريش جاهز، متى تستلم؟");
  await expect(
    page.getByRole("link", { name: "المحادثات، 2 رسالة جديدة" }).first(),
  ).toBeAttached();

  // «لاحقًا» يغلقها ولا تعود لنفس الرسائل، وتبقى الشارة.
  await alert.getByRole("button", { name: "لاحقًا" }).click();
  await expect(alert).toBeHidden();
  await page.reload();
  await expect(
    page.getByRole("link", { name: "المحادثات، 2 رسالة جديدة" }).first(),
  ).toBeAttached();
  await expect(alert).toBeHidden();

  // رسالة أحدث تعيد التنبيه، و«فتح المحادثة» يذهب إليها.
  unread = {
    total: 3,
    conversations: [
      { ...unread.conversations[0], unread: 3, lastAt: "2026-11-10T12:05:00Z" },
    ],
  };
  await page.reload();
  const again = page.getByRole("dialog", { name: "لديك 3 رسائل جديدة" });
  await expect(again).toBeVisible();
  await again.getByRole("link", { name: "فتح المحادثة والرد" }).click();
  await expect(page).toHaveURL(
    /\/messages\?c=00000000-0000-4000-8000-0000000000c1/,
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
