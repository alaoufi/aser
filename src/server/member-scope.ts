import type { MineFilters, SessionUser } from "../lib/types";
import { databaseConfigured, db } from "./db";

/**
 * فلاتر العضو أعلى الرئيسية والتصفح والعروض (قرار المالك 2026-11-22): الأصل العرض والطلب،
 * وكل عضو يرى ما يشبه حاجته في حدود منطقته إن أراد. الافتراضي يعرض الكل بلا فلتر، وكل مفتاح
 * يعمل وحده، وإذا فُعّل اثنان اجتمع شرطاهما.
 *   - الأسرة المنتجة: «مشابه لمنتجاتي» (أقسام منتجاتها، من أسر غيرها) و«منطقتي» (منطقة مطبخها).
 *   - العميل: «مشابه لطلباتي» (أقسام ما طلبه) و«منطقتي» (منطقته المحفوظة في الجهاز).
 *   - المندوب: «حسب تغطيتي» (مدينته ومدن المراكز التي يوصّل لها).
 * الإدارة لا علاقة لها بهذا (حسابها في الموقع شخصي كغيره).
 */
export type MineKey = "similar" | "area" | "coverage";
export type MemberKind = "family" | "customer" | "courier";
export type MemberScope = {
  kind: MemberKind | null;
  options: { key: MineKey; label: string }[];
  active: MineKey[];
  filters: MineFilters | null;
  /** سبب ظاهر حين لا يستطيع الفلتر أن يعمل (مثل: لم تطلب شيئًا بعد). */
  notes: string[];
  /** سطر الحالة تحت المفاتيح: ما يُعرض الآن بالضبط (الأقسام والمنطقة والمدن بأسمائها). */
  summary: string;
};

const OPTIONS: Record<MemberKind, { key: MineKey; label: string }[]> = {
  family: [
    { key: "similar", label: "مشابه لمنتجاتي" },
    { key: "area", label: "منطقتي" },
  ],
  customer: [
    { key: "similar", label: "مشابه لطلباتي" },
    { key: "area", label: "منطقتي" },
  ],
  courier: [{ key: "coverage", label: "حسب تغطيتي" }],
};

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
): Promise<MemberScope> {
  const none: MemberScope = {
    kind: null,
    options: [],
    active: [],
    filters: null,
    notes: [],
    summary: "",
  };
  if (!user || !databaseConfigured()) return none;
  const who = await kindOf(user);
  if (!who) return none;
  const options = OPTIONS[who.kind];
  const active = asked.filter((k) => options.some((o) => o.key === k));
  if (!active.length)
    return {
      ...none,
      kind: who.kind,
      options,
      summary: "يُعرض الآن الكل، بلا فلتر. اختر ما يناسبك من الخيارات.",
    };
  const filters: MineFilters = {};
  const notes: string[] = [];
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
      if (!filters.categories.length)
        notes.push("أضف منتجاتك وأقسامها أولًا ليعمل «مشابه لمنتجاتي».");
    }
    if (active.includes("area")) filters.region = who.producer.region;
  } else if (who.kind === "customer") {
    if (active.includes("similar")) {
      filters.categories = (
        await db().query<{ id: string }>(
          `SELECT DISTINCT pc.category_id AS id FROM jdatna.order_requests o
             JOIN jdatna.product_categories pc ON pc.product_id=o.product_id WHERE o.user_id=$1`,
          [user.id],
        )
      ).rows.map((r) => r.id);
      if (!filters.categories.length)
        notes.push("لم تطلب شيئًا بعد، فلا شيء يشبه طلباتك.");
    }
    if (active.includes("area")) {
      if (savedRegion) filters.region = savedRegion;
      else notes.push("اختر منطقتك من «نطاقك» ليعمل «منطقتي».");
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
    summary: notes.length ? "" : await describe(who.kind, filters),
  };
}

const list = (names: string[], max = 4) =>
  names.length > max
    ? `${names.slice(0, max).join("، ")} وغيرها`
    : names.join("، ");
/** يصف ما يُعرض الآن بأسماء الأقسام والمنطقة والمدن، مثل: «ما يشبه منتجاتك (جريش، مرقوق) في منطقة القصيم». */
async function describe(kind: MemberKind, f: MineFilters) {
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
      `${kind === "family" ? "ما يشبه منتجاتك من أسر أخرى" : "ما يشبه طلباتك"} (${list(categories)})`,
    );
  // بلا أقسام: «كل ما في منطقة القصيم» بدل «في منطقة القصيم» وحدها.
  const all = categories.length ? "" : "كل ما ";
  if (region) parts.push(`${all}في ${region}`);
  if (cities.length) parts.push(`${all}في تغطيتك: ${list(cities, 6)}`);
  return parts.length ? `يُعرض الآن ${parts.join(" ")}.` : "";
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
