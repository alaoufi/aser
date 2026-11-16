import { test, expect } from "@playwright/test";

test("the user guide is a book: contents first, pages turn, and chapters open from the index", async ({
  page,
}) => {
  await page.goto("/guide");
  await expect(
    page.getByRole("heading", { level: 1, name: "دليل المستخدم" }),
  ).toBeVisible();
  const book = page.getByRole("region", { name: "دليل المستخدم" });
  await expect(book.getByText("الغلاف")).toBeVisible();
  await expect(book.getByRole("button", { name: "→ السابقة" })).toBeDisabled();
  await book.getByRole("button", { name: "افتح الكتاب ←" }).click();
  // الفهرس أول صفحة، وفيه كل الفصول.
  const toc = book.getByRole("list", { name: "الفهرس" });
  await expect(toc).toBeVisible();
  await expect(toc.getByRole("link")).toHaveCount(15);
  await toc.getByRole("link", { name: /الرسائل الصوتية/ }).click();
  await expect(page).toHaveURL(/#voice$/);
  const voice = book.getByRole("article", { name: "الرسائل الصوتية" });
  await expect(voice).toBeVisible();
  await expect(voice).toContainText("حتى دقيقتين");
  // الصفحات المطوية خاملة: لا تصلها لوحة المفاتيح ولا قارئ الشاشة.
  await expect(book.getByRole("article", { name: "التقييم" })).toHaveCount(0);
  await book.getByRole("button", { name: "التالية ←" }).click();
  await expect(book.getByRole("article", { name: "التقييم" })).toHaveCount(0);
  await expect(
    page.getByRole("article", { name: /الاشتراكات|الإبلاغ والحظر/ }).first(),
  ).toBeVisible();
  // الأسهم: الأيمن للسابقة في الكتاب العربي.
  await page.keyboard.press("ArrowRight");
  await expect(voice).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("a chapter link opens the book on that chapter, and the full text mode lists every chapter", async ({
  page,
}) => {
  await page.goto("/guide#safety");
  const book = page.getByRole("region", { name: "دليل المستخدم" });
  await expect(
    book.getByRole("article", { name: "الإبلاغ والحظر" }),
  ).toContainText("نعم، احظر المحادثة");
  await page.getByRole("button", { name: "عرض الدليل نصًّا متصلًا" }).click();
  await expect(page.getByRole("article")).toHaveCount(15);
  await expect(
    page.getByRole("button", { name: "طباعة الدليل" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "عرض الكتاب ثلاثي الأبعاد" }).click();
  await expect(
    page.getByRole("region", { name: "دليل المستخدم" }),
  ).toBeVisible();
});

test("the guide is linked from the site footer", async ({ page }) => {
  await page.goto("/about");
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "دليل المستخدم" })
    .click();
  await expect(page).toHaveURL(/\/guide$/);
});
