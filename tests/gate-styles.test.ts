import { test } from "node:test";
import assert from "node:assert/strict";
import { GATE_STYLES, pickGateStyle } from "../src/lib/gate-styles";

// «البوابة» (طلب المالك 2026-11-28): حركة مختلفة مع كل تحديث، و?gate= لمعاينة نمط بعينه.
test("the gate picks a known style, random when none is asked", () => {
  for (const g of GATE_STYLES) assert.equal(pickGateStyle(g), g);
  assert.ok(GATE_STYLES.includes(pickGateStyle("x<script>")));
  assert.ok(GATE_STYLES.includes(pickGateStyle(null)));
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(pickGateStyle());
  assert.equal(seen.size, GATE_STYLES.length, "كل الأنماط تظهر");
});
