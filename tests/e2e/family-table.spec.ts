import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  tablePresetIds,
  tablePresets,
  tableShapes,
  type FamilyTableDesign,
} from "../../src/lib/family-table";

/**
 * مكتبة موائد الأسر (طلب المالك 2026-11-26): الأسرة تختار مائدتها من لوحتها، وتظهر في صفحتها
 * وعليها «حياكم الله» وأطباقها. قاعدة اختبار معزولة فقط.
 */
const family = {
  id: "ft",
  name: "مطبخ أم سعد",
  phone: "+966500000082",
  role: "producer",
};

test("a family picks its table from the library and saves it", async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("jdatna:family-welcome", "1"),
  );
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: family, registrationOpen: true } }),
  );
  await page.route("**/api/producer/profile", (r) =>
    r.fulfill({
      json: {
        profile: {
          id: "00000000-0000-4000-8000-000000000082",
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
  const own = {
    name: family.name,
    chosen: false,
    table: { ...tablePresets.classic } as FamilyTableDesign,
    welcome: "",
    dishes: [
      { id: "11111111-1111-4111-8111-111111111111", name: "جريش" },
      { id: "22222222-2222-4222-8222-222222222222", name: "مرقوق" },
      { id: "33333333-3333-4333-8333-333333333333", name: "قرصان" },
    ],
  };
  let sent: unknown;
  await page.route("**/api/producer/table", (r) => {
    if (r.request().method() === "PUT") {
      sent = r.request().postDataJSON();
      const { welcome, ...table } = sent as Record<string, string>;
      Object.assign(own, { table, welcome, chosen: true });
    }
    return r.fulfill({ json: own });
  });
  await page.goto("/dashboard");
  const card = page.getByRole("region", { name: "مائدة الأسرة" });
  // زر أعلى اللوحة ينقل إلى «المائدة» في تبويب «هوية الأسرة».
  await page.getByRole("link", { name: "اختر مائدة أسرتك ↓" }).click();
  await expect(page).toHaveURL(/\/dashboard\/identity#table$/);
  await expect(
    page.getByRole("tab", { name: "المائدة", selected: true }),
  ).toBeVisible();
  await expect(card).toBeVisible();
  await expect(card).toContainText("٣٨٬٨٨٠");
  const preview = card.getByRole("figure", { name: "معاينة مائدتك" });
  await expect(preview).toContainText("حياكم الله");
  await expect(preview).toContainText("مرقوق");

  // مقترح جاهز يملأ كل الاختيارات.
  await card.getByRole("button", { name: "الديوانية" }).click();
  await expect(card.getByRole("button", { name: "الديوانية" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(card.getByRole("radio", { name: "بيضاوية" })).toBeChecked();
  await expect(preview).toHaveAttribute("data-display", "ring");
  // ثم تعديل اختيار واحد.
  await card.getByText("سداسية", { exact: true }).click();
  await expect(preview).toHaveAttribute("data-shape", "hex");
  await expect(card.getByRole("button", { name: "الديوانية" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  // العبارة: الافتراضية «حياكم الله»، والأسرة تكتب عبارتها فتظهر في المعاينة.
  const phrase = card.getByLabel("العبارة على المائدة");
  await expect(phrase).toHaveAttribute("placeholder", "حياكم الله");
  await phrase.fill("هلا بضيوف أم سعد");
  await expect(preview).toContainText("هلا بضيوف أم سعد");
  await expect(preview).not.toContainText("حياكم الله");
  await card.screenshot({
    path: `test-results/family-table-pick-${info.project.name}.png`,
  });
  await card.getByRole("button", { name: "حفظ المائدة" }).click();
  await expect(card).toContainText("تم حفظ مائدتك");
  expect(sent).toEqual({
    ...tablePresets.diwan,
    shape: "hex",
    welcome: "هلا بضيوف أم سعد",
  });
  // مسح العبارة يعيد «حياكم الله».
  await phrase.fill("");
  await expect(preview).toContainText("حياكم الله");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test.describe("the family page shows the chosen table", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database",
  );
  const uid = randomUUID(),
    pid = randomUUID(),
    slug = `family-table-${pid}`;
  const dishes = ["جريش", "مرقوق", "قرصان", "كبسة", "معصوب", "حنيني"];
  let pool: Pool;
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
    ).toMatch(/^jdatna_test_/);
    const city = (
      await pool.query(
        "SELECT id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' LIMIT 1",
      )
    ).rows[0].id;
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'family-table',$2,'producer',now())",
      [uid, `family-table-${uid}`],
    );
    await pool.query(
      "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة المائدة للاختبار',$4,'+966500000082','approved')",
      [pid, uid, slug, city],
    );
    for (const [i, name] of dishes.entries())
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status,price,created_at) VALUES($1,$2,$3,'fixture','صحن','available',30,now()-($4 || ' minutes')::interval)",
        [randomUUID(), pid, name, String(i)],
      );
  });
  test.afterAll(async () => {
    await pool.query("DELETE FROM jdatna.producer_table WHERE producer_id=$1", [
      pid,
    ]);
    await pool.query("DELETE FROM jdatna.products WHERE producer_id=$1", [pid]);
    await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [pid]);
    await pool.query("DELETE FROM jdatna.users WHERE id=$1", [uid]);
    await pool.end();
  });

  test("default table, then each preset, with the dishes and «حياكم الله»", async ({
    page,
  }, info) => {
    // المشروعان يغيّران مائدة الأسرة نفسها، فيكفي واحد للتعديل وكلاهما للصور.
    const table = page.getByRole("figure", {
      name: "مائدة أسرة المائدة للاختبار",
    });
    await page.goto(`/producers/${slug}`);
    await expect(table).toBeVisible();
    await expect(table).toContainText("حياكم الله");
    await expect(table).toHaveAttribute("data-shape", "rect");
    // الأطباق روابط لصفحاتها.
    await expect(table.getByRole("link")).toHaveCount(6);
    await expect(table.getByRole("link", { name: "جريش" })).toHaveAttribute(
      "href",
      /^\/products\//,
    );
    if (info.project.name !== "desktop") {
      await table.screenshot({
        path: `test-results/family-table-mobile-classic.png`,
      });
      return;
    }
    // عبارة الأسرة تظهر بدل «حياكم الله».
    await pool.query(
      `INSERT INTO jdatna.producer_table(producer_id,shape,height,finish,ornament,frame,display,welcome) VALUES($1,'rect','raised','walnut','sadu','plain','grid','أهلًا وسهلًا بكم')
       ON CONFLICT(producer_id) DO UPDATE SET welcome=EXCLUDED.welcome`,
      [pid],
    );
    await page.reload();
    await expect(table).toContainText("أهلًا وسهلًا بكم");
    await expect(table).not.toContainText("حياكم الله");
    await pool.query(
      "UPDATE jdatna.producer_table SET welcome=NULL WHERE producer_id=$1",
      [pid],
    );
    // كل الأشكال بلون وزخرفة مختلفين، للصور.
    const finishes = [
      "walnut",
      "sidr",
      "athel",
      "ivory",
      "olive",
      "henna",
      "najdi",
      "ebony",
    ];
    const ornaments = ["sadu", "najdi", "palm", "star", "dots", "none"];
    const heights = ["raised", "low", "floor"];
    for (const [i, shape] of tableShapes.entries()) {
      await pool.query(
        `UPDATE jdatna.producer_table SET shape=$2,height=$3,finish=$4,ornament=$5,frame=$6,display=$7 WHERE producer_id=$1`,
        [
          pid,
          shape,
          heights[i % 3],
          finishes[i % 8],
          ornaments[i % 6],
          ["plain", "double", "gold", "sadu", "carved"][i % 5],
          ["grid", "ring", "row"][i % 3],
        ],
      );
      await page.reload();
      await expect(table).toHaveAttribute("data-shape", shape);
      await table.screenshot({
        path: `test-results/family-shape-${i}-${shape}.png`,
      });
    }
    for (const id of tablePresetIds) {
      const d = tablePresets[id];
      await pool.query(
        `INSERT INTO jdatna.producer_table(producer_id,shape,height,finish,ornament,frame,display) VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT(producer_id) DO UPDATE SET shape=$2,height=$3,finish=$4,ornament=$5,frame=$6,display=$7`,
        [pid, d.shape, d.height, d.finish, d.ornament, d.frame, d.display],
      );
      await page.reload();
      await expect(table).toHaveAttribute("data-shape", d.shape);
      await expect(table).toContainText("حياكم الله");
      await table.screenshot({
        path: `test-results/family-table-${id}.png`,
      });
    }
  });
});
