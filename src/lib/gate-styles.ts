/**
 * أنماط «البوابة» (القوس في أعلى الرئيسية، طلب المالك 2026-11-28): بين صحون المنتجات حركة تتغير
 * مع كل تحديث للصفحة. يُختار نمط عشوائيًا في الخادم لكل زيارة، و`?gate=` لمعاينة نمط بعينه.
 */
export const GATE_STYLES = [
  "arrows",
  "lights",
  "pearls",
  "belt",
  "stars",
] as const;
export type GateStyle = (typeof GATE_STYLES)[number];

export function pickGateStyle(wanted?: string | null): GateStyle {
  if (wanted && (GATE_STYLES as readonly string[]).includes(wanted))
    return wanted as GateStyle;
  return GATE_STYLES[Math.floor(Math.random() * GATE_STYLES.length)];
}
