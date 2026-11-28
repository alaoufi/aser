import { test, expect, type Page } from "@playwright/test";

/**
 * ترتيب القائمة الجانبية بالسحب والإفلات لكل مدير (طلب المالك 2026-11-28، SortableJS):
 * السحب يغيّر الترتيب، و«حفظ الترتيب» يحفظه ويبقى بعد التحديث، و«استعادة الترتيب الافتراضي» تعيده.
 * على الجوال: ضغط مطوّل ثم سحب.
 */
const admin = { id: "a", name: "مدير", phone: "+966500000009", role: "admin" };
type Order = { groups: string[]; items: Record<string, string[]> } | null;

async function setup(page: Page) {
  let saved: Order = null;
  const puts: unknown[] = [];
  await page.addInitScript(() =>
    sessionStorage.setItem("jdatna:pending-families-seen", "1"),
  );
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: admin, registrationOpen: true } }),
  );
  await page.route("**/api/admin/summary", (r) =>
    r.fulfill({ json: { summary: {} } }),
  );
  await page.route("**/api/admin/producers**", (r) =>
    r.fulfill({ json: { producers: [], count: 0, families: [] } }),
  );
  await page.route("**/api/admin/menu-layout", (r) =>
    r.fulfill({ json: { layout: null } }),
  );
  await page.route("**/api/admin/menu-layout/mine", async (r) => {
    if (r.request().method() === "PUT") {
      const body = r.request().postDataJSON();
      puts.push(body);
      saved = body.reset ? null : body;
      return r.fulfill({ json: { order: saved } });
    }
    return r.fulfill({ json: { order: saved } });
  });
  return { puts, saved: () => saved };
}

const titles = (page: Page) =>
  page
    .getByRole("complementary", { name: "أقسام الإدارة" })
    .locator("[role=group] > p")
    .allTextContents();

async function openMenu(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) < 1024)
    await page.getByRole("button", { name: "أقسام الإدارة" }).click();
  // القائمة تُرسم بعد قراءة الجلسة.
  await expect(
    page
      .getByRole("complementary", { name: "أقسام الإدارة" })
      .getByRole("link", { name: "الطلبات" }),
  ).toBeVisible();
}

test("a manager drags the sidebar into their own order, saves it, keeps it after reload, and restores the default", async ({
  page,
  isMobile,
}) => {
  const { puts } = await setup(page);
  await page.goto("/admin");
  await openMenu(page);
  const before = await titles(page);
  await page.getByRole("button", { name: /ترتيب القائمة/ }).click();
  const editor = page.getByTestId("menu-order");
  const groups = editor.locator("[data-group-handle]");
  await expect(groups.first()).toContainText(before[0]);
  // اسحب المجموعة الثانية فوق الأولى.
  const from = (await groups.nth(1).boundingBox())!;
  const to = (await groups.nth(0).boundingBox())!;
  if (isMobile) {
    // الجوال: ضغط مطوّل ثم سحب (لمس).
    await page.mouse.move(from.x + 20, from.y + from.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(450);
    await page.mouse.move(to.x + 20, to.y + 2, { steps: 12 });
    await page.mouse.up();
  } else {
    await groups.nth(1).dragTo(groups.nth(0), {
      targetPosition: { x: 20, y: 2 },
    });
  }
  await expect(groups.first()).toContainText(before[1]);
  await page.screenshot({
    path: `test-results/menu-order-${isMobile ? "mobile" : "desktop"}.png`,
  });
  await page.getByRole("button", { name: "حفظ الترتيب" }).click();
  await expect.poll(() => puts.length).toBe(1);
  const body = puts[0] as { groups: string[] };
  expect(body.groups.slice(0, 2)).toEqual([before[1], before[0]]);
  // بعد الحفظ: القائمة بالترتيب الجديد، وتبقى بعد التحديث.
  await expect
    .poll(() => titles(page))
    .toEqual(expect.arrayContaining([before[1], before[0]]));
  expect((await titles(page)).slice(0, 2)).toEqual([before[1], before[0]]);
  await page.reload();
  await openMenu(page);
  await expect
    .poll(async () => (await titles(page)).slice(0, 2))
    .toEqual([before[1], before[0]]);
  // الاستعادة: تأكيد ثم الترتيب الافتراضي.
  await page.getByRole("button", { name: /ترتيب القائمة/ }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "استعادة الترتيب الافتراضي" }).click();
  await expect.poll(() => puts.at(-1)).toEqual({ reset: true });
  await expect
    .poll(async () => (await titles(page)).slice(0, 2))
    .toEqual(before.slice(0, 2));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("cancel leaves the order as it was, and the links work again", async ({
  page,
}) => {
  const { puts } = await setup(page);
  await page.goto("/admin");
  await openMenu(page);
  const before = await titles(page);
  await page.getByRole("button", { name: /ترتيب القائمة/ }).click();
  await page.getByRole("button", { name: "إلغاء" }).click();
  expect(await titles(page)).toEqual(before);
  expect(puts).toHaveLength(0);
  await expect(
    page
      .getByRole("complementary", { name: "أقسام الإدارة" })
      .getByRole("link", { name: "الطلبات" }),
  ).toBeVisible();
});
