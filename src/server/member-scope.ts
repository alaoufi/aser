import type { MineFilters, SessionUser } from "../lib/types";
import { databaseConfigured, db } from "./db";
import {
  siteTextDefaults,
  type SiteTextKey,
  type SiteTexts,
} from "../lib/site-texts";

/**
 * فلاتر العضو أعلى الرئيسية والتصفح والعروض (قرار المالك 2026-11-22): الأصل العرض والطلب،
 * وكل عضو يرى ما يشبه حاجته في حدود منطقته إن أراد. الافتراضي يعرض الكل بلا فلتر، وكل مفتاح
 * يعمل وحده، وإذا فُعّل اثنان اجتمع شرطاهما.
 *   - الأسرة المنتجة: «مشابه لمنتجاتي» (أقسام منتجاتها، من أسر غيرها) و«منطقتي» (منطقة مطبخها).
 *   - العميل: «خياراتي» (أقسام يختارها بنفسه من قائمة الأقسام) و«منطقتي» (منطقته المحفوظة في الجهاز).
 *   - المندوب: «حسب تغطيتي» (مدينته ومدن المراكز التي يوصّل لها).
 * الإدارة لا علاقة لها بهذا (حسابها في الموقع شخصي كغيره). كل كلمات اللوحة من «نصوص الموقع» (mine.*).
 */
export type MineKey = "similar" | "area" | "coverage";
export type MemberKind = "family" | "customer" | "courier";
export type MemberScope = {
  kind: MemberKind | null;
  options: { key: MineKey; label: string }[];
  active: MineKey[];
  filters: MineFilters | null;
  /** حين لا يُعرض شيء بسبب فلتر لا يعمل (مثل: لم تطلب شيئًا بعد)؛ يصير هو سطر الحالة. */
  notes: string[];
  /** ما يحتاجه الخيار ليعمل، فيُطلب من العضو في اللوحة نفسها: منطقته، أو خياراته من الأقسام. */
  needs: "region" | "interests" | null;
  /** «خياراتي» مفعّل وله خيارات: يظهر «عدّل خياراتي». */
  editable: boolean;
  /** كلمات اللوحة (من «نصوص الموقع»). */
  words: Record<
    | "title"
    | "pickChoices"
    | "pickRegion"
    | "regionPlaceholder"
    | "save"
    | "edit",
    string
  >;
  /** سطر الحالة تحت المفاتيح: ما يُعرض الآن بالضبط (الأقسام والمنطقة والمدن بأسمائها). */
  summary: string;
};

const OPTIONS: Record<MemberKind, { key: MineKey; text: SiteTextKey }[]> = {
  family: [
    { key: "similar", text: "mine.familySimilar" },
    { key: "area", text: "mine.familyArea" },
  ],
  customer: [
    { key: "similar", text: "mine.customerChoices" },
    { key: "area", text: "mine.customerArea" },
  ],
  courier: [{ key: "coverage", text: "mine.courierCoverage" }],
};
/** كلمة من «نصوص الموقع»؛ المحذوفة تعود لأصلها (لا يصح زر أو سطر بلا كلام). */
const wordsOf =
  (texts?: Partial<SiteTexts> | null) =>
  (k: SiteTextKey): string =>
    texts?.[k] || siteTextDefaults[k];

/** يقرأ المفاتيح المفعّلة من الرابط (?mine=similar,area) ويُبقي المعروف منها فقط. */
export function parseMine(value: string | string[] | undefined): MineKey[] {
  const raw = (Array.isArray(value) ? value.join(",") : (value ?? ""))
    .split(",")
    .map((s) => s.trim());
  return (["similar", "area", "coverage"] as const).filter((k) =>
    raw.includes(k),
  );
}

async function kindOf(user: SessionUser) {
  if (user.role === "courier") {
    const c = (
      await db().query<{ id: string; city: string }>(
        "SELECT id,city_id AS city FROM jdatna.courier_profiles WHERE user_id=$1",
        [user.id],
      )
    ).rows[0];
    return c ? { kind: "courier" as const, courier: c } : null;
  }
  if (user.role === "producer") {
    const p = (
      await db().query<{ id: string; region: string }>(
        "SELECT p.id,c.region_id AS region FROM jdatna.producer_profiles p JOIN jdatna.cities c ON c.id=p.city_id WHERE p.user_id=$1",
        [user.id],
      )
    ).rows[0];
    if (p) return { kind: "family" as const, producer: p };
  }
  return { kind: "customer" as const };
}

export async function memberScope(
  user: SessionUser | null,
  asked: MineKey[],
  savedRegion = "",
  texts?: Partial<SiteTexts> | null,
): Promise<MemberScope> {
  const t = wordsOf(texts);
  const words: MemberScope["words"] = {
    title: t("mine.title"),
    pickChoices: t("mine.pickChoices"),
    pickRegion: t("mine.pickRegion"),
    regionPlaceholder: t("mine.regionPlaceholder"),
    save: t("mine.save"),
    edit: t("mine.edit"),
  };
  const none: MemberScope = {
    kind: null,
    options: [],
    active: [],
    filters: null,
    notes: [],
    needs: null,
    editable: false,
    words,
    summary: "",
  };
  if (!user || !databaseConfigured()) return none;
  const who = await kindOf(user);
  if (!who) return none;
  const options = OPTIONS[who.kind].map((o) => ({
    key: o.key,
    label: t(o.text),
  }));
  const active = asked.filter((k) => options.some((o) => o.key === k));
  if (!active.length)
    return {
      ...none,
      kind: who.kind,
      options,
      summary: t("mine.all"),
    };
  const filters: MineFilters = {};
  const notes: string[] = [];
  let unapplied = "";
  let needs: MemberScope["needs"] = null;
  let editable = false;
  // أسماء ما يظهر في سطر الحالة: ما اختاره العميل بنفسه (بلا فروعه).
  let named: string[] | undefined;
  if (who.kind === "family") {
    if (active.includes("similar")) {
      filters.categories = (
        await db().query<{ id: string }>(
          `SELECT DISTINCT pc.category_id AS id FROM jdatna.products x
             JOIN jdatna.product_categories pc ON pc.product_id=x.id WHERE x.producer_id=$1
           UNION SELECT category_id FROM jdatna.producer_categories WHERE producer_id=$1`,
          [who.producer.id],
        )
      ).rows.map((r) => r.id);
      filters.excludeProducer = who.producer.id;
      if (!filters.categories.length) notes.push(t("mine.familyNone"));
    }
    if (active.includes("area")) filters.region = who.producer.region;
  } else if (who.kind === "customer") {
    if (active.includes("similar")) {
      // «خياراتي»: الأقسام التي اختارها بنفسه، مع فروعها (اختيار قسم يشمل ما تحته).
      filters.categories = (
        await db().query<{ id: string }>(
          `WITH RECURSIVE picked AS (
             SELECT category_id AS id FROM jdatna.member_interests WHERE user_id=$1
             UNION SELECT c.id FROM jdatna.categories c JOIN picked p ON c.parent_id=p.id
           ) SELECT id FROM picked`,
          [user.id],
        )
      ).rows.map((r) => r.id);
      editable = true;
      named = (
        await db().query<{ id: string }>(
          "SELECT category_id AS id FROM jdatna.member_interests WHERE user_id=$1",
          [user.id],
        )
      ).rows.map((r) => r.id);
      if (!filters.categories.length) {
        // لم يختر بعد: يُطلب منه الاختيار من قائمة الأقسام.
        needs = "interests";
        notes.push(t("mine.pickChoices"));
      }
    }
    if (active.includes("area")) {
      // بلا منطقة محفوظة: يُطلب منه تحديد منطقته أولًا.
      if (savedRegion) filters.region = savedRegion;
      else {
        needs ??= "region";
        unapplied = t("mine.pickRegion").replace(/:$/, "");
        if (needs === "region") notes.push(t("mine.pickRegion"));
      }
    }
  } else {
    // مدينة المندوب، ومدن المراكز التي اختار التوصيل لها (المركز تحت مدينته في شجرة التغطية).
    filters.cities = (
      await db().query<{ id: string }>(
        `WITH RECURSIVE up AS (
           SELECT n.id,n.parent_id,n.city_id FROM jdatna.courier_centers cc
             JOIN jdatna.coverage_nodes n ON n.id=cc.center_node_id WHERE cc.courier_id=$1
           UNION ALL SELECT n.id,n.parent_id,n.city_id FROM up u JOIN jdatna.coverage_nodes n ON n.id=u.parent_id
         )
         SELECT city_id AS id FROM up WHERE city_id IS NOT NULL UNION SELECT $2`,
        [who.courier.id, who.courier.city],
      )
    ).rows.map((r) => r.id);
  }
  return {
    kind: who.kind,
    options,
    active,
    filters,
    notes,
    needs,
    editable: editable && !needs,
    words,
    summary: notes.length
      ? notes[0]
      : await describe(
          who.kind,
          { ...filters, categories: named ?? filters.categories },
          t,
          unapplied,
        ),
  };
}

const list = (names: string[], max = 4) =>
  names.length > max
    ? `${names.slice(0, max).join("، ")} وغيرها`
    : names.join("، ");
/** يصف ما يُعرض الآن بأسماء الأقسام والمنطقة والمدن، مثل: «ما يشبه منتجاتك (جريش، مرقوق) في منطقة القصيم». */
async function describe(
  kind: MemberKind,
  f: MineFilters,
  t: (k: SiteTextKey) => string,
  unapplied = "",
) {
  const [categories, region, cities] = await Promise.all([
    f.categories?.length
      ? db()
          .query<{ name: string }>(
            "SELECT name FROM jdatna.categories WHERE id=ANY($1::text[]) ORDER BY name",
            [f.categories],
          )
          .then((r) => r.rows.map((x) => x.name))
      : [],
    f.region
      ? db()
          .query<{ name: string }>(
            "SELECT name FROM jdatna.regions WHERE id=$1",
            [f.region],
          )
          .then((r) => r.rows[0]?.name ?? "")
      : "",
    f.cities?.length
      ? db()
          .query<{ name: string }>(
            "SELECT name FROM jdatna.cities WHERE id=ANY($1::text[]) ORDER BY name",
            [f.cities],
          )
          .then((r) => r.rows.map((x) => x.name))
      : [],
  ]);
  const parts: string[] = [];
  if (categories.length)
    parts.push(
      `${t(kind === "family" ? "mine.familyLike" : "mine.customerLike")} (${list(categories)})`,
    );
  // بلا أقسام: «كل ما في منطقة القصيم» بدل «في منطقة القصيم» وحدها.
  const all = categories.length ? "" : `${t("mine.everything")} `;
  if (region) parts.push(`${all}في ${region}`);
  if (cities.length)
    parts.push(`${all}${t("mine.inCoverage")} ${list(cities, 6)}`);
  const shown = parts.length
    ? `${t("mine.shown")} ${parts.join(" ")}`
    : t("mine.all").replace(/[.،].*$/, "");
  return unapplied ? `${shown}، و${unapplied}.` : `${shown}.`;
}

/** شروط SQL لفلاتر العضو على المنتجات (x) أو الأسر (p)، تُضاف لشروط البحث. */
export function mineConditions(
  f: MineFilters | null | undefined,
  products: boolean,
  add: (sql: string, value: unknown) => void,
) {
  if (!f) return;
  if (f.categories)
    add(
      products
        ? "EXISTS(SELECT 1 FROM jdatna.product_categories mc WHERE mc.product_id=x.id AND mc.category_id=ANY(?::text[]))"
        : "EXISTS(SELECT 1 FROM jdatna.producer_categories mc WHERE mc.producer_id=p.id AND mc.category_id=ANY(?::text[]))",
      f.categories,
    );
  if (f.cities) add("p.city_id=ANY(?::text[])", f.cities);
  if (f.region)
    add(
      "EXISTS(SELECT 1 FROM jdatna.cities mr WHERE mr.id=p.city_id AND mr.region_id=?)",
      f.region,
    );
  if (f.excludeProducer) add("p.id<>?::uuid", f.excludeProducer);
}
