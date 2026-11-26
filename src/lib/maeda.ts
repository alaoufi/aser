/**
 * «صانع المائدة» (اعتماد المالك 2026-11-26): كل أسرة تركّب مائدتها في صفحتها من خمسة محاور،
 * والإدارة تخفي ما لا تريده من الخيارات. لا قيمة محفوظة = مائدة السدو الأصلية (الافتراضي).
 * الأسماء كلها في «نصوص الموقع» (maeda.<محور>.<قيمة>)؛ هنا المفاتيح فقط.
 */
export const maedaShapes = [
  "band",
  "rect",
  "square",
  "oval",
  "round",
  "sufra",
] as const;
export const maedaFinishes = [
  "plain",
  "sadu",
  "najdi",
  "embroidered",
  "wood",
  "brass",
  "khoos",
  "marble",
] as const;
export const maedaEdges = ["none", "gold", "double", "sadu"] as const;
export const maedaColors = {
  qahwa: "#6b4226",
  zaytooni: "#4f5d36",
  annabi: "#7d1a16",
  kohli: "#1f2a44",
  ramli: "#c9a46a",
} as const;
export type MaedaColor = keyof typeof maedaColors;
export const maedaColorKeys = Object.keys(maedaColors) as MaedaColor[];

export type MaedaStyle = {
  shape: (typeof maedaShapes)[number];
  finish: (typeof maedaFinishes)[number];
  color: MaedaColor;
  edge: (typeof maedaEdges)[number];
  runner: boolean;
};
export type MaedaAxis = "shape" | "finish" | "color" | "edge";
export const maedaAxes: { axis: MaedaAxis; values: readonly string[] }[] = [
  { axis: "shape", values: maedaShapes },
  { axis: "finish", values: maedaFinishes },
  { axis: "color", values: maedaColorKeys },
  { axis: "edge", values: maedaEdges },
];

/** موائد جاهزة (أول ما تراه الأسرة)؛ «sadu» = بلا قيمة محفوظة، أي المائدة الأصلية. */
export const maedaPresets: { id: string; style: MaedaStyle | null }[] = [
  { id: "sadu", style: null },
  {
    id: "nahas",
    style: {
      shape: "oval",
      finish: "brass",
      color: "qahwa",
      edge: "gold",
      runner: false,
    },
  },
  {
    id: "khashab",
    style: {
      shape: "sufra",
      finish: "wood",
      color: "qahwa",
      edge: "none",
      runner: true,
    },
  },
  {
    id: "mutarraz",
    style: {
      shape: "rect",
      finish: "embroidered",
      color: "annabi",
      edge: "none",
      runner: false,
    },
  },
  {
    id: "najdi",
    style: {
      shape: "square",
      finish: "najdi",
      color: "kohli",
      edge: "double",
      runner: false,
    },
  },
  {
    id: "zaytooni",
    style: {
      shape: "round",
      finish: "plain",
      color: "zaytooni",
      edge: "sadu",
      runner: false,
    },
  },
];

/** ما يُبدأ به التركيب اليدوي إن لم تكن للأسرة مائدة محفوظة. */
export const maedaStarter: MaedaStyle = {
  shape: "rect",
  finish: "sadu",
  color: "qahwa",
  edge: "none",
  runner: false,
};

/** الخيار المخفي من الإدارة: "<محور>:<قيمة>"، أو "runner" للمفرش. */
export const maedaOptionKey = (axis: MaedaAxis | "runner", value?: string) =>
  axis === "runner" ? "runner" : `${axis}:${value}`;

export function isMaedaStyle(v: unknown): v is MaedaStyle {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    maedaShapes.includes(o.shape as MaedaStyle["shape"]) &&
    maedaFinishes.includes(o.finish as MaedaStyle["finish"]) &&
    maedaColorKeys.includes(o.color as MaedaColor) &&
    maedaEdges.includes(o.edge as MaedaStyle["edge"]) &&
    typeof o.runner === "boolean"
  );
}

/** هل تستعمل المائدة خيارًا أخفته الإدارة؟ (تُعرض حينها مائدة السدو الأصلية). */
export function usesHidden(style: MaedaStyle, hidden: readonly string[]) {
  return (
    maedaAxes.some(({ axis }) =>
      hidden.includes(maedaOptionKey(axis, style[axis] as string)),
    ) ||
    (style.runner && hidden.includes("runner"))
  );
}

/** المائدة كما تُعرض للزوار: المحفوظة إن صحّت ولم تُخفَ خياراتها، وإلا الأصلية (null). */
export function visibleMaeda(raw: unknown, hidden: readonly string[]) {
  return isMaedaStyle(raw) && !usesHidden(raw, hidden) ? raw : null;
}

export const sameMaeda = (a: MaedaStyle | null, b: MaedaStyle | null) =>
  JSON.stringify(a) === JSON.stringify(b);
