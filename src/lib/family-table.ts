import type { CSSProperties } from "react";

/**
 * مكتبة موائد الأسر (طلب المالك 2026-11-26): كل أسرة تختار مائدة تميزها، تُعرض عليها
 * منتجاتها ويُكتب عليها «حياكم الله». المائدة تُبنى من ستة اختيارات:
 * الشكل × الارتفاع × اللون × الزخرفة × الإطار × طريقة العرض، فتكون آلاف الموائد،
 * ومعها «مقترحات» جاهزة بأسماء. «مائدة اليوم» في الرئيسية تبقى المائدة الرئيسية للموقع.
 * أسماء الاختيارات نفسها في «نصوص الموقع» (ftable.opt.*)، وهنا معرّفاتها وشكلها فقط.
 */
export const tableShapes = [
  "rect",
  "square",
  "round",
  "oval",
  "stadium",
  "cushion",
  "arch",
  "diamond",
  "pent",
  "hex",
  "oct",
  "dodeca",
  "scallop",
  "flower",
  "star",
  "petal",
  "shield",
  "drum",
] as const;
export const tableHeights = ["raised", "low", "floor"] as const;
export const tableFinishes = [
  "walnut",
  "sidr",
  "athel",
  "ivory",
  "olive",
  "henna",
  "najdi",
  "ebony",
] as const;
export const tableOrnaments = [
  "none",
  "sadu",
  "najdi",
  "palm",
  "star",
  "dots",
] as const;
export const tableFrames = [
  "plain",
  "double",
  "gold",
  "sadu",
  "carved",
] as const;
export const tableDisplays = ["grid", "ring", "row"] as const;

export type TableShape = (typeof tableShapes)[number];
export type TableHeight = (typeof tableHeights)[number];
export type TableFinish = (typeof tableFinishes)[number];
export type TableOrnament = (typeof tableOrnaments)[number];
export type TableFrame = (typeof tableFrames)[number];
export type TableDisplay = (typeof tableDisplays)[number];
export type FamilyTableDesign = {
  shape: TableShape;
  height: TableHeight;
  finish: TableFinish;
  ornament: TableOrnament;
  frame: TableFrame;
  display: TableDisplay;
};
export const tableDimensions = {
  shape: tableShapes,
  height: tableHeights,
  finish: tableFinishes,
  ornament: tableOrnaments,
  frame: tableFrames,
  display: tableDisplays,
} as const;
export type TableDimension = keyof typeof tableDimensions;
export const tableDimensionKeys = Object.keys(
  tableDimensions,
) as TableDimension[];

/** عدد الموائد الممكنة من المكتبة. */
export const tableCount = tableDimensionKeys.reduce(
  (n, k) => n * tableDimensions[k].length,
  1,
);

/** المائدة الافتراضية لمن لم يختر بعد: قريبة من «مائدة اليوم». */
export const defaultTable: FamilyTableDesign = {
  shape: "rect",
  height: "raised",
  finish: "walnut",
  ornament: "sadu",
  frame: "plain",
  display: "grid",
};

/** مقترحات جاهزة، كل واحدة مائدة كاملة باسم (الاسم في «نصوص الموقع»: ftable.preset.*). */
export const tablePresets: Record<TablePresetId, FamilyTableDesign> = {
  majlis: {
    shape: "rect",
    height: "floor",
    finish: "henna",
    ornament: "sadu",
    frame: "sadu",
    display: "row",
  },
  diwan: {
    shape: "oval",
    height: "raised",
    finish: "ebony",
    ornament: "star",
    frame: "gold",
    display: "ring",
  },
  nakhla: {
    shape: "round",
    height: "raised",
    finish: "olive",
    ornament: "palm",
    frame: "double",
    display: "ring",
  },
  teen: {
    shape: "square",
    height: "floor",
    finish: "athel",
    ornament: "najdi",
    frame: "carved",
    display: "grid",
  },
  qahwa: {
    shape: "oct",
    height: "raised",
    finish: "sidr",
    ornament: "dots",
    frame: "double",
    display: "grid",
  },
  arss: {
    shape: "hex",
    height: "raised",
    finish: "ivory",
    ornament: "najdi",
    frame: "gold",
    display: "ring",
  },
  sufra: {
    shape: "round",
    height: "floor",
    finish: "najdi",
    ornament: "sadu",
    frame: "sadu",
    display: "ring",
  },
  classic: { ...defaultTable },
};
export const tablePresetIds = [
  "classic",
  "majlis",
  "diwan",
  "nakhla",
  "teen",
  "qahwa",
  "arss",
  "sufra",
] as const;
export type TablePresetId = (typeof tablePresetIds)[number];

export function isTableDesign(v: unknown): v is FamilyTableDesign {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return tableDimensionKeys.every((k) =>
    (tableDimensions[k] as readonly string[]).includes(String(o[k])),
  );
}
/** يقبل تصميمًا محفوظًا (قد يكون ناقصًا أو قديمًا) ويكمله بالافتراضي. */
export function resolveTable(v: unknown): FamilyTableDesign {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out = { ...defaultTable } as Record<TableDimension, string>;
  for (const k of tableDimensionKeys)
    if ((tableDimensions[k] as readonly string[]).includes(String(o[k])))
      out[k] = String(o[k]);
  return out as FamilyTableDesign;
}
export const samePreset = (a: FamilyTableDesign, b: FamilyTableDesign) =>
  tableDimensionKeys.every((k) => a[k] === b[k]);

/** ألوان الخشب أو الطلاء: [فاتح، داكن، لون الكتابة]. */
export const finishColors: Record<TableFinish, [string, string, string]> = {
  walnut: ["#84522a", "#5c3518", "#fbf3e4"],
  sidr: ["#a8743f", "#6f4520", "#fff6e6"],
  athel: ["#d7b583", "#a47a44", "#3a230f"],
  ivory: ["#f3e8d2", "#cdb48a", "#3a230f"],
  olive: ["#5f6b3d", "#3e4826", "#f8f1df"],
  henna: ["#9c3f24", "#6a2412", "#fff1e3"],
  najdi: ["#2f6d6a", "#1d4644", "#f6efe0"],
  ebony: ["#3a2a22", "#1f1511", "#f2d9a4"],
};
const frameColors: Record<TableFrame, string> = {
  plain: "var(--ft-dark)",
  double: "var(--ft-dark)",
  gold: "linear-gradient(135deg,#f1d08a,#b8862f 45%,#f6dc9c 60%,#9c6d22)",
  sadu: "repeating-linear-gradient(45deg,#9c2f1e 0 8px,#f4ead9 8px 11px,#2e1d12 11px 19px,#f4ead9 19px 22px)",
  carved:
    "repeating-conic-gradient(from 45deg,var(--ft-dark) 0 25%,var(--ft-wood) 0 50%) 0 0/12px 12px",
};

/** نقاط مضلع (نسب مئوية) من دالة نصف قطر حول المركز؛ rx وry لنسبة الشكل. */
function radial(n: number, r: (t: number) => number, turn = -Math.PI / 2) {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = turn + (i * 2 * Math.PI) / n;
    const k = r(t - turn);
    pts.push(
      `${(50 + Math.cos(t) * k).toFixed(2)}% ${(50 + Math.sin(t) * k).toFixed(2)}%`,
    );
  }
  return `polygon(${pts.join(",")})`;
}
const regular = (n: number) =>
  radial(n, () => 50, -Math.PI / 2 + (n % 2 ? 0 : Math.PI / n));
/** قوس أعلى ومستطيل أسفل (مثل باب المجلس). */
function arch() {
  const pts = ["0% 100%", "0% 42%"];
  for (let i = 0; i <= 24; i++) {
    const t = Math.PI + (i * Math.PI) / 24;
    pts.push(
      `${(50 + Math.cos(t) * 50).toFixed(2)}% ${(42 + Math.sin(t) * 42).toFixed(2)}%`,
    );
  }
  pts.push("100% 100%");
  return `polygon(${pts.join(",")})`;
}
/** درع: أعلى مستقيم وأسفل مدبب منحنٍ. */
function shield() {
  const pts = ["0% 0%", "100% 0%", "100% 45%"];
  for (let i = 1; i < 12; i++) {
    const f = i / 12;
    pts.push(
      `${(100 - f * 50).toFixed(2)}% ${(45 + Math.sin((f * Math.PI) / 2) * 55).toFixed(2)}%`,
    );
  }
  pts.push("50% 100%");
  for (let i = 11; i >= 1; i--) {
    const f = i / 12;
    pts.push(
      `${(f * 50).toFixed(2)}% ${(45 + Math.sin((f * Math.PI) / 2) * 55).toFixed(2)}%`,
    );
  }
  pts.push("0% 45%");
  return `polygon(${pts.join(",")})`;
}
type Geometry = {
  clip: string;
  /** العرض ÷ الارتفاع. */
  ratio: number;
  /** أقصى عرض بالبكسل. */
  max: number;
  /** مساحة المحتوى داخل الشكل (نسبة من كل جهة: أعلى، جانب، أسفل). */
  pad: [number, number, number];
  /** عريضة: الأطباق أصغر وأكثر. */
  wide?: boolean;
};
export const shapeGeometry: Record<TableShape, Geometry> = {
  rect: {
    clip: "inset(0 round 18px)",
    ratio: 2,
    max: 760,
    pad: [8, 6, 8],
    wide: true,
  },
  square: { clip: "inset(0 round 18px)", ratio: 1, max: 520, pad: [9, 9, 9] },
  round: { clip: "circle(50%)", ratio: 1, max: 520, pad: [15, 15, 15] },
  oval: {
    clip: "ellipse(50% 50%)",
    ratio: 1.75,
    max: 760,
    pad: [15, 14, 15],
    wide: true,
  },
  stadium: {
    clip: "inset(0 round 22.7% / 50%)",
    ratio: 2.2,
    max: 780,
    pad: [10, 13, 10],
    wide: true,
  },
  cushion: {
    clip: "inset(0 round 32%)",
    ratio: 1.15,
    max: 560,
    pad: [11, 11, 11],
  },
  arch: { clip: arch(), ratio: 1.25, max: 560, pad: [22, 9, 7] },
  diamond: {
    clip: "polygon(50% 0,100% 50%,50% 100%,0 50%)",
    ratio: 1.6,
    max: 640,
    pad: [20, 22, 20],
  },
  pent: { clip: regular(5), ratio: 1.05, max: 540, pad: [22, 18, 12] },
  hex: {
    clip: "polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)",
    ratio: 1.15,
    max: 560,
    pad: [9, 16, 9],
  },
  oct: { clip: regular(8), ratio: 1, max: 520, pad: [11, 11, 11] },
  dodeca: { clip: regular(12), ratio: 1, max: 520, pad: [12, 12, 12] },
  scallop: {
    clip: radial(144, (t) => 47 + 3 * Math.cos(16 * t)),
    ratio: 1,
    max: 520,
    pad: [15, 15, 15],
  },
  flower: {
    clip: radial(160, (t) => 39 + 11 * Math.abs(Math.cos(4 * t))),
    ratio: 1,
    max: 520,
    pad: [20, 20, 20],
  },
  star: { clip: starClip(), ratio: 1, max: 520, pad: [22, 22, 22] },
  petal: {
    clip: radial(120, (t) => 44 + 6 * Math.cos(6 * t)),
    ratio: 1,
    max: 520,
    pad: [16, 16, 16],
  },
  shield: { clip: shield(), ratio: 1.05, max: 520, pad: [9, 12, 24] },
  drum: {
    clip: "polygon(8% 0,92% 0,100% 50%,92% 100%,8% 100%,0 50%)",
    ratio: 2,
    max: 760,
    pad: [9, 10, 9],
    wide: true,
  },
};
/** نجمة ثمانية الرؤوس ناعمة (رؤوس 50 وتجاويف 40). */
function starClip() {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const t = -Math.PI / 2 + (i * Math.PI) / 8;
    const k = i % 2 ? 41 : 50;
    pts.push(
      `${(50 + Math.cos(t) * k).toFixed(2)}% ${(50 + Math.sin(t) * k).toFixed(2)}%`,
    );
  }
  return `polygon(${pts.join(",")})`;
}

/** متغيرات العرض: الألوان والإطار. الشكل والارتفاع والزخرفة والعرض بخصائص data-*. */
export function tableStyle(d: FamilyTableDesign): CSSProperties {
  const [wood, dark, ink] = finishColors[d.finish];
  const g = shapeGeometry[d.shape];
  return {
    "--ft-clip": g.clip,
    "--ft-ratio": String(g.ratio),
    "--ft-max": `${g.max}px`,
    "--ft-pad": g.pad.map((n) => `${n}%`).join(" "),
    "--ft-wood": wood,
    "--ft-dark": dark,
    "--ft-ink": ink,
    "--ft-frame": frameColors[d.frame],
  } as CSSProperties;
}
export function tableData(d: FamilyTableDesign) {
  return {
    "data-shape": d.shape,
    "data-wide": shapeGeometry[d.shape].wide ? "" : undefined,
    "data-height": d.height,
    "data-ornament": d.ornament,
    "data-frame": d.frame,
    "data-display": d.display,
  };
}
