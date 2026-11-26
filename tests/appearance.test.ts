import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultAppearanceSettings,
  normalizeAppearance,
  paletteScript,
  resolveAppearance,
} from "../src/lib/appearance";
import { siteTextDefaults } from "../src/lib/site-texts";

/** «المظهر» (2026-11-26): إعداد الإدارة واختيار الزائر وسكربت أول زيارة. */
test("admin settings keep the default inside the enabled list and drop unknown values", () => {
  const s = normalizeAppearance({
    template: "simple",
    templates: ["classic", "bogus"],
    palette: "lail",
    palettes: ["contrast", "zzz"],
  });
  assert.deepEqual(s.templates, ["classic", "simple"]);
  assert.deepEqual(s.palettes, ["lail", "contrast"]);
  assert.deepEqual(normalizeAppearance({}), defaultAppearanceSettings);
  assert.equal(normalizeAppearance({ template: "x" }).template, "classic");
});

test("a visitor's choice applies only when the admin offers it", () => {
  const s = normalizeAppearance({
    template: "classic",
    templates: ["classic", "simple"],
    palette: "sadu",
    palettes: ["sadu", "lail"],
  });
  assert.deepEqual(
    resolveAppearance(s, { template: "simple", palette: "lail" }),
    {
      template: "simple",
      palette: "lail",
      explicitPalette: true,
    },
  );
  // قالب أو لون أوقفته الإدارة: يعود للافتراضي.
  assert.deepEqual(
    resolveAppearance(s, { template: "najdi", palette: "neel" }),
    {
      template: "classic",
      palette: "sadu",
      explicitPalette: false,
    },
  );
  assert.deepEqual(resolveAppearance(s, {}), {
    template: "classic",
    palette: "sadu",
    explicitPalette: false,
  });
});

test("the first-visit script only names palettes from the code", () => {
  const js = paletteScript(["sadu", "lail"]);
  assert.match(js, /prefers-color-scheme: dark/);
  assert.match(js, /\["sadu","lail"\]/);
  assert.doesNotMatch(js, /<\/script/i);
  // بلا «ليلي» متاح لا يُقترح الداكن.
  assert.match(paletteScript(["sadu"]), /\["sadu"\]/);
});

test("the simplified template's sentences live in site texts", () => {
  assert.equal(
    siteTextDefaults["simple.title"],
    "أكل بيت جدتك، من أسرة في حيّك",
  );
  assert.equal(
    siteTextDefaults["simple.trust"],
    "كل أسرة تُراجَع مستنداتها قبل الظهور.",
  );
  assert.equal(
    siteTextDefaults["family.askMenu"],
    "اسأل عن قائمة اليوم بالواتساب",
  );
  // «المائدة» (اختيار المالك): لا رقم ثابت للمناطق في السطر الفرعي.
  assert.doesNotMatch(siteTextDefaults["simple.lead"], /[0-9٠-٩]/);
  assert.equal(siteTextDefaults["simple.table"], "مائدة اليوم");
  assert.ok(siteTextDefaults["simple.tableEmptyTitle"]);
});
