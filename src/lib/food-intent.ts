import type { Category, City } from "./types";
import { DISHES, type Dish } from "./dishes";
import {
  normalizeArabic,
  numberOf,
  parseIntent,
  sameRoot,
  type Intent,
} from "./arabic-intent";

/**
 * «التفاهم» في أكلات جدتنا: يفهم ما يكتبه العميل بكلامه («أبي غدا لعشرة بالرياض بميزانية 300»)
 * ويربطه بكتالوج الموقع: الأكلة من دليل الأكلات والأقسام، والمكان من المدن والمناطق.
 * القارئ العام في arabic-intent.ts (مشترك مع «أي خدمة»، server-edge#29)، وهذا ربطه بجدتنا فقط.
 */
export type FoodIntent = Intent & {
  /** المدينة أو المنطقة المفهومة من الجملة. */
  place: { regionId: string; cityId: string | null; name: string } | null;
  dishes: Dish[];
  categories: Category[];
  /** كلمات البحث في المنتجات: الأكلات والأقسام المفهومة، وإلا ما تبقى من كلمات ذات معنى. */
  search: string;
  /** جملة طلب لا كلمة بحث: فيها وجبة أو عدد أو ميزانية أو وقت أو مكان، أو ثلاث كلمات فأكثر. */
  isRequest: boolean;
};

// كلمات لا تحمل معنى الأكلة: الطلب، وحروف الجر، والوقت، والميزانية.
const FILLER = new Set(
  [
    "ابي",
    "ابغي",
    "ابغى",
    "ابا",
    "اريد",
    "ودي",
    "نبي",
    "نبغي",
    "عندي",
    "عندنا",
    "لو",
    "سمحت",
    "ممكن",
    "في",
    "من",
    "الي",
    "الى",
    "على",
    "عن",
    "مع",
    "بس",
    "و",
    "او",
    "يكون",
    "تكون",
    "شي",
    "شيء",
    "اكل",
    "اكله",
    "اكلات",
    "طبخ",
    "طبخه",
    "بيت",
    "ميزانيه",
    "ميزانيتي",
    "بميزانيه",
    "بحدود",
    "حدود",
    "ريال",
    "اقل",
    "تحت",
    "ما",
    "يتعدي",
    "يتجاوز",
    "يزيد",
    "اليوم",
    "بكره",
    "بكرا",
    "بعد",
    "الحين",
    "الان",
    "ضروري",
    "مستعجل",
    "عاجل",
    "شخص",
    "اشخاص",
    "نفر",
    "انفار",
    "افراد",
    "ضيوف",
    "عائله",
    "كيلو",
    "نص",
    "نصف",
    "ربع",
    "صحن",
    "صحون",
    "حبه",
    "حبات",
    "منطقه",
    "عائله",
    "لعائله",
    "اسره",
    "مدينه",
    "حي",
  ].map(normalizeArabic),
);
const MEAL_WORDS = new Set(
  [
    "فطور",
    "فطار",
    "ريوق",
    "غدا",
    "غداء",
    "غدى",
    "عشا",
    "عشاء",
    "عزيمه",
    "وليمه",
    "مناسبه",
    "حفله",
    "زواج",
  ].map(normalizeArabic),
);
const isNumberish = (w: string) => numberOf(w) != null;
// اسم مكان بلا «ال» و«منطقة»: «الرياض» ← «رياض»، «منطقة القصيم» ← «قصيم».
const placeKey = (name: string) =>
  normalizeArabic(name)
    .replace(/^منطقه\s+/, "")
    .split(" ")
    .map((w) => w.replace(/^ال/, ""))
    .join(" ");
const wordKey = (w: string) =>
  w.replace(/^(وال|بال|فال|لل|ال|و|ب|ف|ل)(?=..)/, "");

export function understandFood(
  text: string,
  {
    cities = [],
    categories = [],
  }: { cities?: City[]; categories?: Category[] } = {},
): FoodIntent {
  const intent = parseIntent(text);
  const words = intent.words;
  const keys = words.map(wordKey);
  const joined = ` ${keys.join(" ")} `;
  // المكان: المدينة أولًا (أدق)، ثم المنطقة.
  let place: FoodIntent["place"] = null;
  const placeWords = new Set<number>();
  for (const c of cities) {
    const k = placeKey(c.name);
    if (k.length >= 3 && joined.includes(` ${k} `)) {
      place = { regionId: c.regionId, cityId: c.id, name: c.name };
      keys.forEach((w, i) => k.split(" ").includes(w) && placeWords.add(i));
      break;
    }
  }
  if (!place)
    for (const c of cities) {
      const k = placeKey(c.regionName);
      if (k.length >= 3 && joined.includes(` ${k} `)) {
        place = { regionId: c.regionId, cityId: null, name: c.regionName };
        keys.forEach((w, i) => k.split(" ").includes(w) && placeWords.add(i));
        break;
      }
    }
  // الأكلة: من دليل الأكلات (جريش، مرقوق…) ومن أسماء الأقسام.
  const content = words.filter(
    (w, i) =>
      !placeWords.has(i) &&
      !FILLER.has(w) &&
      !FILLER.has(wordKey(w)) &&
      !MEAL_WORDS.has(w) &&
      !isNumberish(w) &&
      w.length >= 3,
  );
  const dishes = DISHES.filter((d) =>
    [d.name, d.search].some((n) =>
      normalizeArabic(n)
        .split(" ")
        .some(
          (part) => part.length >= 3 && content.some((w) => sameRoot(w, part)),
        ),
    ),
  );
  const matchedCategories = categories.filter((c) =>
    normalizeArabic(c.name)
      .split(" ")
      .some(
        (part) => part.length >= 4 && content.some((w) => sameRoot(w, part)),
      ),
  );
  const search = dishes.length
    ? dishes.map((d) => d.search).join(" ")
    : matchedCategories.length
      ? matchedCategories.map((c) => c.name).join(" ")
      : content.join(" ");
  const isRequest = Boolean(
    intent.meal ||
    intent.count ||
    intent.budget ||
    intent.when ||
    intent.quantity ||
    place ||
    words.length >= 3,
  );
  return {
    ...intent,
    place,
    dishes,
    categories: matchedCategories,
    search,
    isRequest,
  };
}

const MEAL_LABEL = {
  breakfast: "فطور",
  lunch: "غداء",
  dinner: "عشاء",
  occasion: "عزيمة أو مناسبة",
} as const;
const WHEN_LABEL: Record<string, string> = {
  today: "اليوم",
  now: "الآن",
  tomorrow: "بكرة",
  after_tomorrow: "بعد بكرة",
  morning: "الصبح",
  afternoon: "العصر",
  evening: "المغرب",
  night: "الليل",
  tonight: "الليلة",
  thursday: "الخميس",
  friday: "الجمعة",
  saturday: "السبت",
};
const UNIT_LABEL: Record<string, string> = {
  kg: "كيلو",
  plate: "صحن",
  tray: "صينية",
  piece: "حبة",
  box: "علبة",
  dozen: "درزن",
};

/** ما فهمه الموقع بكلمات قصيرة يقرؤها العميل، وأول ما ينقص الطلب. */
export function describeFood(intent: FoodIntent) {
  const parts: { label: string; value: string }[] = [];
  if (intent.dishes.length)
    parts.push({
      label: "الأكلة",
      value: intent.dishes.map((d) => d.name).join("، "),
    });
  else if (intent.categories.length)
    parts.push({
      label: "القسم",
      value: intent.categories.map((c) => c.name).join("، "),
    });
  if (intent.meal)
    parts.push({ label: "الوجبة", value: MEAL_LABEL[intent.meal] });
  if (intent.count)
    parts.push({
      label: intent.count.unit === "people" ? "العدد" : "الكمية",
      value:
        intent.count.unit === "people"
          ? `${intent.count.value} ${intent.count.value <= 10 && intent.count.value >= 3 ? "أشخاص" : "شخص"}`
          : String(intent.count.value),
    });
  if (intent.quantity)
    parts.push({
      label: "الكمية",
      value:
        `${intent.quantity.value === 0.5 ? "نص" : intent.quantity.value === 0.25 ? "ربع" : intent.quantity.value} ${UNIT_LABEL[intent.quantity.unit] ?? ""}`.trim(),
    });
  if (intent.when)
    parts.push({
      label: "الموعد",
      value: WHEN_LABEL[intent.when] ?? intent.when,
    });
  if (intent.place) parts.push({ label: "المكان", value: intent.place.name });
  if (intent.budget)
    parts.push({ label: "الميزانية", value: `${intent.budget} ريال` });
  if (intent.urgent) parts.push({ label: "الاستعجال", value: "مستعجل" });
  const missing =
    !intent.dishes.length && !intent.categories.length && !intent.search
      ? "dish"
      : !intent.place
        ? "place"
        : null;
  return { parts, missing };
}
