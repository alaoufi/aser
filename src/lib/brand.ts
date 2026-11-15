import type { CSSProperties } from "react";

/**
 * مكتبة الهويات.
 * - هوية الأسرة (الخلفية والشكل): لون من مئات التدرجات + زخرفة من مئات الأشكال + تأثير خفيف + حجم.
 * - هوية القسم (البرواز): نوع إطار (متعرج، مسنن، مقوّس، مزدوج، رفيع، سميك...) بسماكة.
 * - المنتج يدمج الهويتين: خلفية أسرته وزخرفتها داخل برواز قسمه وبلون أسرته.
 * العناصر المميزة (premium) معزولة للهوية الاحترافية المدفوعة (tier = "pro").
 */
export type BrandPalette = {
  id: string;
  name: string;
  bg: string;
  accent: string;
  ink: string;
  /** خلفية متدرجة (المكتبة المميزة). */
  bg2?: string;
  premium?: boolean;
};
export type BrandItem = { id: string; name: string; premium?: boolean };

/* ===================== الألوان: مئات التدرجات ===================== */
export const hueFamilies: { hue: number; name: string }[] = [
  { hue: 0, name: "رمان" },
  { hue: 12, name: "حناء" },
  { hue: 24, name: "طين" },
  { hue: 32, name: "تمر" },
  { hue: 40, name: "زعفران" },
  { hue: 48, name: "كركم" },
  { hue: 58, name: "ليمون" },
  { hue: 75, name: "هيل" },
  { hue: 95, name: "نخيل" },
  { hue: 120, name: "ريحان" },
  { hue: 145, name: "نعناع" },
  { hue: 165, name: "زمرد" },
  { hue: 180, name: "فيروز" },
  { hue: 195, name: "بحر" },
  { hue: 210, name: "سماء" },
  { hue: 225, name: "نيلي" },
  { hue: 245, name: "ليل" },
  { hue: 265, name: "خزامى" },
  { hue: 285, name: "بنفسج" },
  { hue: 300, name: "توت" },
  { hue: 320, name: "ورد طائفي" },
  { hue: 340, name: "عنّاب" },
  { hue: 30, name: "قهوة" },
  { hue: 20, name: "رمل" },
];
/** 12 درجة لكل لون: 4 إضاءات × 3 تشبعات. */
const tones = [24, 31, 38, 45].flatMap((l) =>
  [38, 58, 78].map((s) => ({ l, s })),
);
const toneNames = ["عميق", "داكن", "متوسط", "زاهٍ"];
const satNames = ["هادئ", "معتدل", "قوي"];
const hsl = (h: number, s: number, l: number) =>
  `hsl(${h} ${Math.round(s)}% ${Math.round(l)}%)`;

const generated: BrandPalette[] = hueFamilies.flatMap((f, fi) =>
  tones.map((t, ti) => {
    // «قهوة» و«رمل» تدرجات ترابية أقل تشبعًا.
    const earthy = fi >= 22;
    const s = earthy ? t.s * 0.55 : t.s;
    return {
      id: `c${fi}-${ti}`,
      name: `${f.name} ${toneNames[Math.floor(ti / 3)]} ${satNames[ti % 3]}`,
      accent: hsl(f.hue, s, t.l),
      bg: hsl(f.hue, Math.min(s, 70) * 0.55, 95 - (ti % 3)),
      ink: hsl(f.hue, Math.min(s, 60), 13),
    };
  }),
);
/** المكتبة المميزة: خلفيات متدرجة بلونين. */
const duo: [number, number, string][] = [
  [40, 0, "غروب"],
  [165, 40, "زمرد وذهب"],
  [195, 265, "بحر وخزامى"],
  [320, 40, "ورد وذهب"],
  [0, 285, "رمان وبنفسج"],
  [95, 48, "نخيل وكركم"],
  [225, 180, "ليل وفيروز"],
  [24, 340, "طين وعنّاب"],
  [12, 58, "حناء وليمون"],
  [145, 210, "نعناع وسماء"],
  [300, 225, "توت ونيلي"],
  [32, 120, "تمر وريحان"],
];
const premiumPalettes: BrandPalette[] = duo.map(([a, b, name], i) => ({
  id: `duo${i}`,
  name,
  accent: hsl(a, 62, 34),
  bg: hsl(a, 55, 94),
  bg2: hsl(b, 55, 92),
  ink: hsl(a, 55, 13),
  premium: true,
}));
export const brandPalettes: BrandPalette[] = [...generated, ...premiumPalettes];
const paletteById = new Map(brandPalettes.map((p) => [p.id, p]));

/* ===================== الزخارف: مئات الأشكال ===================== */
/** شكل في مربع (-12..12)؛ C = لون الأسرة. */
type Motif = { id: string; name: string; svg: string; premium?: boolean };
const star = (n: number, r1: number, r2: number) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const r = i % 2 ? r2 : r1;
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
const ring = (n: number, d: number, r: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return `<circle cx='${(d * Math.cos(a)).toFixed(2)}' cy='${(d * Math.sin(a)).toFixed(2)}' r='${r}'/>`;
  }).join("");
export const motifs: Motif[] = [
  {
    id: "najmah",
    name: "نجمة ثمانية",
    svg: "<rect x='-8' y='-8' width='16' height='16'/><rect x='-8' y='-8' width='16' height='16' transform='rotate(45)'/>",
  },
  { id: "dots", name: "نقاط", svg: "<circle r='3.2' fill='C'/>" },
  { id: "diamond", name: "معين", svg: "<path d='M0-11 11 0 0 11-11 0Z'/>" },
  { id: "wave", name: "موجة", svg: "<path d='M-12 0q6-8 12 0t12 0'/>" },
  {
    id: "hexagon",
    name: "سداسي",
    svg: "<path d='M0-11 9.5-5.5v11L0 11-9.5 5.5v-11Z'/>",
  },
  {
    id: "sadu",
    name: "سدو",
    svg: "<path d='M-12 6-6-4 0 6 6-4 12 6'/><path d='M0-11l3 3-3 3-3-3Z' fill='C'/>",
  },
  {
    id: "najdi",
    name: "نجدي مدرّج",
    svg: "<path d='M-12 9H-8V4H-4V-1H4V4H8V9H12'/><path d='M-3-6 0-9 3-6'/>",
  },
  {
    id: "palm",
    name: "سعف",
    svg: "<path d='M0 11V-11M0 6C0-2-5-7-10-9M0 6C0-2 5-7 10-9M0-1C-2-5-6-6-9-6M0-1c2-4 6-5 9-5'/>",
  },
  {
    id: "crescent",
    name: "هلال",
    svg: "<path d='M3-9a9 9 0 1 0 0 18a12 12 0 0 1 0-18z' fill='C' stroke='none'/>",
  },
  {
    id: "scale",
    name: "قشور",
    svg: "<path d='M-12 4a6 6 0 0 1 12 0a6 6 0 0 1 12 0'/>",
  },
  { id: "chevron", name: "متعرج", svg: "<path d='M-12 4-6-4 0 4 6-4 12 4'/>" },
  {
    id: "cross",
    name: "صليب مزهّر",
    svg: "<path d='M0-9V9M-9 0H9'/><circle r='2.5'/>",
  },
  {
    id: "square",
    name: "مربعات",
    svg: "<rect x='-7' y='-7' width='14' height='14' rx='2'/>",
  },
  { id: "triangle", name: "مثلث", svg: "<path d='M0-9 9 7H-9Z'/>" },
  {
    id: "drop",
    name: "قطرة",
    svg: "<path d='M0-10C5-3 7 1 7 4a7 7 0 0 1-14 0c0-3 2-7 7-14Z'/>",
  },
  {
    id: "leaf",
    name: "ورقة",
    svg: "<path d='M-9 9C-9-3-3-9 9-9 9 3 3 9-9 9ZM-9 9 5-5'/>",
  },
  { id: "flower", name: "زهرة رباعية", svg: ring(4, 5, 4.6) },
  { id: "rings", name: "حلقات", svg: "<circle r='8'/><circle r='3'/>" },
  {
    id: "girih",
    name: "نجمة عشرية",
    svg: `<polygon points='${star(10, 11, 6)}'/><circle r='3.5'/>`,
    premium: true,
  },
  {
    id: "star12",
    name: "نجمة اثنا عشرية",
    svg: `<polygon points='${star(12, 11, 7.5)}'/><polygon points='${star(6, 6, 3.5)}'/>`,
    premium: true,
  },
  {
    id: "arabesque",
    name: "أرابيسك",
    svg: "<path d='M0 0c0-6 6-10 10-6s0 10-5 8M0 0c0 6-6 10-10 6s0-10 5-8M0 0c6 0 10 6 6 10s-10 0-8-5M0 0c-6 0-10-6-6-10s10 0 8 5'/>",
    premium: true,
  },
  {
    id: "mashrabiya",
    name: "مشربية",
    svg: "<path d='M-12-12 12 12M12-12-12 12M0-12v24M-12 0h24'/><circle r='6'/>",
    premium: true,
  },
  {
    id: "rosette",
    name: "وردة إسلامية",
    svg: ring(6, 5.5, 5.5),
    premium: true,
  },
  {
    id: "interlace",
    name: "تشابك",
    svg: "<rect x='-8' y='-8' width='16' height='16' rx='4'/><rect x='-8' y='-8' width='16' height='16' rx='4' transform='rotate(45)'/><circle r='3.5'/>",
    premium: true,
  },
  {
    id: "lotus",
    name: "لوتس",
    svg: "<path d='M0 10C-7 4-7-4 0-10C7-4 7 4 0 10ZM0 10C-11 8-12 0-10-4M0 10C11 8 12 0 10-4'/>",
    premium: true,
  },
  {
    id: "kufic",
    name: "كوفي مربع",
    svg: "<path d='M-9-9H9V9H-5V-5H5V5H-1'/>",
    premium: true,
  },
];
const motifById = new Map(motifs.map((m) => [m.id, m]));
export const arrangements = [
  { id: "g", name: "منتظم" },
  { id: "s", name: "متداخل" },
];
export const weights = [
  { id: "1", name: "رفيع", w: 0.7 },
  { id: "2", name: "متوسط", w: 1.2 },
  { id: "3", name: "عريض", w: 2 },
];
export const rotations = [
  { id: "0", name: "مستقيم" },
  { id: "45", name: "مائل" },
];
/** كل الزخارف: الشكل × الترتيب × السماكة × الميل، ومعها «سادة». */
export const brandPatterns: BrandItem[] = [
  { id: "plain", name: "سادة" },
  ...motifs.flatMap((m) =>
    arrangements.flatMap((a) =>
      weights.flatMap((w) =>
        rotations.map((r) => ({
          id: `${m.id}-${a.id}-${w.id}-${r.id}`,
          name: `${m.name} · ${a.name} · ${w.name} · ${r.name}`,
          premium: m.premium,
        })),
      ),
    ),
  ),
];
const patternById = new Map(brandPatterns.map((p) => [p.id, p]));
export function parsePattern(id: string) {
  const [motif, arr, weight, rot] = id.split("-");
  return { motif, arr, weight, rot };
}
export const patternId = (motif: string, arr = "g", weight = "2", rot = "0") =>
  motif === "plain" ? "plain" : `${motif}-${arr}-${weight}-${rot}`;

/* ===================== التأثيرات والأحجام ===================== */
export const brandEffects: BrandItem[] = [
  { id: "soft", name: "ناعم" },
  { id: "raised", name: "بارز" },
  { id: "glow", name: "ضوء" },
  { id: "glass", name: "لمعة" },
  { id: "gold", name: "رقائق ذهب", premium: true },
  { id: "carved", name: "محفور", premium: true },
];
export const brandScales = [
  { id: 1, name: "دقيقة", size: 30 },
  { id: 2, name: "متوسطة", size: 46 },
  { id: 3, name: "كبيرة", size: 70 },
];

/* ===================== براويز الأقسام ===================== */
/** شريط مزخرف حول البطاقة (بلاطة 16×16 بلون الأسرة). */
const bands: Record<string, string> = {
  zigzag:
    "<path d='M0 12 4 4 8 12 12 4 16 12' fill='none' stroke='C' stroke-width='2.2'/>",
  teeth: "<path d='M0 16 4 3 8 16ZM8 16 12 3 16 16Z' fill='C'/>",
  scallop:
    "<circle cx='4' cy='8' r='4' fill='C'/><circle cx='12' cy='8' r='4' fill='C'/>",
  wavy: "<path d='M0 8q4-7 8 0t8 0' fill='none' stroke='C' stroke-width='2.2'/>",
  beads:
    "<circle cx='4' cy='8' r='2.6' fill='C'/><circle cx='12' cy='8' r='2.6' fill='C'/>",
  rope: "<path d='M-4 16 12 0M4 16 20 0' stroke='C' stroke-width='3.2'/>",
  merlons: "<path d='M0 16V5h5v5h6V5h5v11Z' fill='C'/>",
  rhombs: "<path d='M8 1 15 8 8 15 1 8Z' fill='C'/>",
  stitch:
    "<path d='M2 8h5M10 8h5' stroke='C' stroke-width='2.4' stroke-linecap='round'/>",
  ladder:
    "<path d='M0 3h16M0 13h16M4 3v10M12 3v10' stroke='C' stroke-width='1.6' fill='none'/>",
};
export const frameTypes: BrandItem[] = [
  { id: "line", name: "خط" },
  { id: "double", name: "مزدوج" },
  { id: "groove", name: "محفور" },
  { id: "ridge", name: "حافة" },
  { id: "bevel", name: "مشطوف بارز" },
  { id: "dashed", name: "متقطع" },
  { id: "dotted", name: "منقط" },
  { id: "arch", name: "قوس نجدي" },
  { id: "notched", name: "زوايا متقابلة" },
  { id: "rounded", name: "مدوّر" },
  { id: "gold", name: "خيط ذهبي" },
  { id: "corners", name: "زوايا مزخرفة" },
  { id: "ribbon", name: "شريط علوي" },
  { id: "inset", name: "إطار داخلي" },
  { id: "zigzag", name: "متعرج" },
  { id: "teeth", name: "مسنن" },
  { id: "scallop", name: "مقوّس" },
  { id: "wavy", name: "متموج" },
  { id: "beads", name: "خرز" },
  { id: "rope", name: "مجدول" },
  { id: "merlons", name: "شرفات نجدية" },
  { id: "rhombs", name: "معينات" },
  { id: "stitch", name: "غرزة" },
  { id: "ladder", name: "سلّم" },
];
export const frameThickness = [
  { id: "1", name: "نحيف" },
  { id: "2", name: "متوسط" },
  { id: "3", name: "سميك" },
];
export const categoryFrames: BrandItem[] = frameTypes.flatMap((t) =>
  frameThickness.map((k) => ({
    id: `${t.id}-${k.id}`,
    name: `${t.name} ${k.name}`,
  })),
);
const frameIds = new Set(categoryFrames.map((f) => f.id));
/** سماكة كل نوع (بكسل) حسب نحيف/متوسط/سميك. */
const frameWidth: Record<string, [number, number, number]> = {
  line: [1, 2.5, 5],
  double: [3, 5, 8],
  groove: [3, 5, 8],
  ridge: [3, 5, 8],
  bevel: [2, 3.5, 6],
  dashed: [1.5, 2.5, 4],
  dotted: [2, 3, 5],
  arch: [1, 2.5, 4],
  notched: [1, 2.5, 4],
  rounded: [1, 2.5, 4],
  gold: [1, 1.5, 2.5],
  corners: [1.5, 2.5, 4],
  ribbon: [4, 7, 11],
  inset: [1, 2, 3.5],
};

/* ===================== الحساب ===================== */
export type BrandChoice = {
  palette?: string | null;
  pattern?: string | null;
  effect?: string | null;
  scale?: number | null;
};
export const identityCount = (() => {
  const family =
    brandPalettes.length *
    brandPatterns.length *
    brandEffects.length *
    brandScales.length;
  return {
    palettes: brandPalettes.length,
    patterns: brandPatterns.length,
    frames: categoryFrames.length,
    family,
    product: family * categoryFrames.length,
  };
})();

function hash(seed: string, salt: string) {
  let h = 2166136261;
  for (const ch of (seed ?? "") + salt)
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}
function pickFree<T extends { premium?: boolean }>(
  list: T[],
  seed: string,
  salt: string,
) {
  const free = list.filter((x) => !x.premium);
  return free[hash(seed, salt) % free.length];
}
/** هوية الأسرة: اختيارها، وإلا هوية ثابتة مشتقة من معرّفها (من المجاني فقط). */
export function resolveBrand(seed: string, choice?: BrandChoice | null) {
  const c = choice ?? {};
  return {
    palette:
      paletteById.get(c.palette ?? "") ??
      pickFree(brandPalettes, seed, "palette"),
    pattern:
      patternById.get(c.pattern ?? "") ??
      pickFree(brandPatterns.slice(1), seed, "pattern"),
    effect:
      brandEffects.find((p) => p.id === c.effect) ??
      pickFree(brandEffects, seed, "effect"),
    scale:
      brandScales.find((s) => s.id === c.scale) ??
      brandScales[hash(seed, "scale") % brandScales.length],
  };
}
export function paletteFor(seed: string, chosen?: string | null) {
  return resolveBrand(seed, { palette: chosen }).palette;
}
export function frameFor(categoryId?: string | null, chosen?: string | null) {
  const id =
    chosen && frameIds.has(chosen)
      ? chosen
      : categoryId
        ? categoryFrames[hash(categoryId, "frame") % categoryFrames.length].id
        : "line-1";
  const [type, thick] = id.split("-");
  return { id, type, thick: Number(thick) as 1 | 2 | 3 };
}

const svgUrl = (inner: string, size: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>${inner}</svg>`)}")`;
const nonScaling = (svg: string) =>
  svg.replace(
    /<(path|rect|circle|polygon)\b/g,
    "<$1 vector-effect='non-scaling-stroke'",
  );

/** بلاطة الزخرفة (40×40) بلون الأسرة وبشفافية خفيفة لا تؤثر على الكتابة. */
export function patternUrl(id: string, color: string, opacity = 0.11) {
  if (!id || id === "plain") return "none";
  const { motif, arr, weight, rot } = parsePattern(id);
  const m = motifById.get(motif);
  if (!m) return "none";
  const w = weights.find((x) => x.id === weight)?.w ?? 1.2;
  const shape = (x: number, y: number, s: number) =>
    `<g transform='translate(${x} ${y}) rotate(${rot === "45" ? 45 : 0}) scale(${s})'>${nonScaling(m.svg)}</g>`;
  const body =
    arr === "s"
      ? [
          shape(20, 20, 0.72),
          ...[0, 40].flatMap((x) => [0, 40].map((y) => shape(x, y, 0.72))),
        ].join("")
      : shape(20, 20, 1.25);
  const inner = `<g opacity='${opacity}' fill='none' stroke='C' stroke-width='${w}' stroke-linejoin='round'>${body}</g>`;
  return svgUrl(inner.replaceAll("'C'", `'${color}'`), 40);
}
export function bandUrl(type: string, color: string) {
  const b = bands[type];
  return b ? svgUrl(b.replaceAll("'C'", `'${color}'`), 16) : "none";
}

/** الصنف والمتغيرات لعنصر يحمل هوية الأسرة، ومعها برواز القسم إن وُجد. */
export function identityProps(
  seed: string,
  choice?: BrandChoice | null,
  frame?: { categoryId?: string | null; chosen?: string | null } | null,
): { className: string; style: CSSProperties } {
  const b = resolveBrand(seed, choice);
  const style: Record<string, string> = {
    "--brand-bg": b.palette.bg,
    "--brand-bg2": b.palette.bg2 ?? b.palette.bg,
    "--brand-accent": b.palette.accent,
    "--brand-ink": b.palette.ink,
    "--brand-pattern": patternUrl(b.pattern.id, b.palette.accent),
    "--brand-size": `${b.scale.size}px`,
  };
  let frameClass = "";
  if (frame) {
    const f = frameFor(frame.categoryId, frame.chosen);
    if (bands[f.type]) {
      frameClass = " frame-band";
      style["--frame-band"] = bandUrl(f.type, b.palette.accent);
      style["--fw"] = `${[5, 8, 12][f.thick - 1]}px`;
    } else {
      frameClass = ` frame-${f.type}`;
      style["--fw"] = `${frameWidth[f.type][f.thick - 1]}px`;
    }
  }
  return {
    className: `branded fx-${b.effect.id}${frameClass}`,
    style: style as CSSProperties,
  };
}
export function brandStyle(seed: string, chosen?: string | null) {
  return identityProps(seed, { palette: chosen }).style;
}

export const isPaletteId = (id: string) => paletteById.has(id);
export const isPatternId = (id: string) => patternById.has(id);
export const isFrameId = (id: string) => frameIds.has(id);
export function isPremium(choice: BrandChoice) {
  const motif = choice.pattern ? parsePattern(choice.pattern).motif : "";
  return Boolean(
    paletteById.get(choice.palette ?? "")?.premium ||
    motifById.get(motif)?.premium ||
    brandEffects.find((p) => p.id === choice.effect)?.premium,
  );
}
/** شكل الزخرفة فقط (لمنع تطابق الهوية في نفس المدينة). */
export const motifOf = (pattern: string) =>
  pattern === "plain" ? "plain" : parsePattern(pattern).motif;
