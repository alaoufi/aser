/**
 * قارئ عربي عام لما يكتبه العضو بكلامه: العدد، والميزانية، والوقت، والاستعجال.
 * منقول من «أي خدمة» (alaoufi/aykdmah → client/src/utils/requestIntent.mjs) حسب الاتفاق في
 * server-edge#29، مع إضافات «أكلات جدتنا»: الوجبة، وعدد الأشخاص، والكمية، وصيغ أكثر للميزانية.
 * بلا أي خدمة خارجية، ويعمل في الخادم والمتصفح. لا يحتوي أي اسم من كتالوج الموقع.
 */
const TASHKEEL = /[ً-ٰٟـ]/g;
const INDIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeArabic(text: string) {
  // الأرقام أولًا: نطاق التشكيل (U+064B–U+0670) يضم الأرقام الهندية (U+0660–U+0669)، فلو حُذف
  // التشكيل قبلها لضاعت «٢٥٠».
  return String(text || "")
    .replace(/[٠-٩]/g, (d) => String(INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN.indexOf(d)))
    .replace(TASHKEEL, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// سوابق الكلمة: «والجريش»، «بالرياض»، «للعزيمة»، «فالكليجا».
const PREFIXES = ["وال", "بال", "فال", "كال", "لل", "ال", "و", "ب", "ف", "ل"];
export function stem(word: string) {
  let w = word;
  for (const p of PREFIXES) {
    if (w.startsWith(p) && w.length - p.length >= 3) {
      w = w.slice(p.length);
      break;
    }
  }
  for (const s of ["ات", "ين", "ون", "يه", "ي", "ه"]) {
    if (w.endsWith(s) && w.length - s.length >= 3) {
      w = w.slice(0, -s.length);
      break;
    }
  }
  return w;
}
export const tokens = (text: string) =>
  normalizeArabic(text).split(" ").filter(Boolean);

/** كلمتان من جذر واحد إن اشتركتا في أولهما (بعد نزع السوابق واللواحق). */
export function sameRoot(a: string, b: string) {
  const x = stem(a);
  const y = stem(b);
  if (x.length < 3 || y.length < 3) return x === y;
  const n = Math.min(4, x.length, y.length);
  return x.slice(0, n) === y.slice(0, n);
}

const NUMBER_WORDS: Record<string, number> = {
  واحد: 1,
  وحده: 1,
  اثنين: 2,
  ثنين: 2,
  اثنان: 2,
  ثلاث: 3,
  ثلاثه: 3,
  اربع: 4,
  اربعه: 4,
  خمس: 5,
  خمسه: 5,
  ست: 6,
  سته: 6,
  سبع: 7,
  سبعه: 7,
  ثمان: 8,
  ثمانيه: 8,
  تسع: 9,
  تسعه: 9,
  عشر: 10,
  عشره: 10,
  عشرين: 20,
  ثلاثين: 30,
  اربعين: 40,
  خمسين: 50,
  ميه: 100,
  مايه: 100,
  مئه: 100,
};
const URGENT = ["ضروري", "مستعجل", "عاجل", "الحين", "الان", "فورا", "سريع"];
const WHEN: Record<string, string> = {
  اليوم: "today",
  الحين: "now",
  الان: "now",
  بكره: "tomorrow",
  بكرا: "tomorrow",
  الصبح: "morning",
  الصباح: "morning",
  العصر: "afternoon",
  المغرب: "evening",
  الليل: "night",
  الليله: "tonight",
  الخميس: "thursday",
  الجمعه: "friday",
  السبت: "saturday",
};
// في جدتنا «غدا» وجبة الغداء (لا «غدًا» بمعنى بكرة): الوقت بكرة يُكتب «بكرة».
const MEALS: Record<string, "breakfast" | "lunch" | "dinner" | "occasion"> = {
  فطور: "breakfast",
  فطار: "breakfast",
  ريوق: "breakfast",
  غدا: "lunch",
  غداء: "lunch",
  غدى: "lunch",
  عشا: "dinner",
  عشاء: "dinner",
  عزيمه: "occasion",
  عزيمة: "occasion",
  وليمه: "occasion",
  مناسبه: "occasion",
  حفله: "occasion",
  زواج: "occasion",
};
const PEOPLE = [
  "شخص",
  "اشخاص",
  "نفر",
  "انفار",
  "افراد",
  "فرد",
  "ضيف",
  "ضيوف",
  "نفس",
  "انفس",
];
const UNITS: Record<string, string> = {
  كيلو: "kg",
  كيلوات: "kg",
  كيلوهات: "kg",
  صحن: "plate",
  صحون: "plate",
  تري: "tray",
  صينيه: "tray",
  حبه: "piece",
  حبات: "piece",
  علبه: "box",
  علب: "box",
  درزن: "dozen",
};

export type Count = { value: number; unit: "people" | "items" };
export type Quantity = { value: number; unit: string };
export type Intent = {
  text: string;
  words: string[];
  count: Count | null;
  quantity: Quantity | null;
  budget: number | null;
  when: string | null;
  meal: "breakfast" | "lunch" | "dinner" | "occasion" | null;
  urgent: boolean;
};

/** رقم من كلمة أو أرقام، بعد نزع «ل» و«ب» و«و» في أولها: «لعشرة»، «ب10». */
export function numberOf(word: string): number | null {
  for (const w of [word, word.replace(/^[لبو]/, "")]) {
    if (NUMBER_WORDS[w] != null) return NUMBER_WORDS[w];
    if (/^\d{1,4}$/.test(w)) return Number(w);
  }
  return null;
}

export function parseIntent(text: string): Intent {
  const norm = normalizeArabic(text);
  const words = norm.split(" ").filter(Boolean);
  const out: Intent = {
    text: norm,
    words,
    count: null,
    quantity: null,
    budget: null,
    when: null,
    meal: null,
    urgent: false,
  };
  const budget = norm.match(
    /(?:بحدود|حدود|ميزانيه|ميزانيتي|بسعر|ما يتعدي|ما يتجاوز|لا يتجاوز|ما يزيد عن|اقل من|تحت)\s*(\d{2,7})|(\d{2,7})\s*(?:ريال|رس|sar)/,
  );
  if (budget) out.budget = Number(budget[1] || budget[2]);
  const used = new Set<number>();
  // الكمية: «2 كيلو»، «نص كيلو»، «كيلو»، «3 صحون».
  for (let i = 0; i < words.length; i++) {
    const unit = UNITS[words[i]];
    if (!unit) continue;
    const before = words[i - 1];
    const value =
      before === "نص" || before === "نصف"
        ? 0.5
        : before === "ربع"
          ? 0.25
          : (before && numberOf(before)) || 1;
    out.quantity = { value, unit };
    used.add(i);
    if (
      before &&
      (numberOf(before) ||
        before === "نص" ||
        before === "نصف" ||
        before === "ربع")
    )
      used.add(i - 1);
    break;
  }
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const n = used.has(i) ? null : numberOf(w);
    if (!out.count && n != null && n !== out.budget && n > 0) {
      const next = words[i + 1] ?? "";
      const prev = words[i - 1] ?? "";
      const people =
        /^ل/.test(w) ||
        PEOPLE.includes(next) ||
        /^ل?(عائله|عايله|اسره)$/.test(prev) ||
        prev === "ل";
      out.count = { value: n, unit: people ? "people" : "items" };
    }
    if (!out.when && WHEN[w]) out.when = WHEN[w];
    if (!out.meal && MEALS[w]) out.meal = MEALS[w];
    if (URGENT.includes(w)) out.urgent = true;
  }
  if (/بعد بكره|بعد بكرا/.test(norm)) out.when = "after_tomorrow";
  return out;
}
