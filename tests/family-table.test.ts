import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultTable,
  isTableDesign,
  resolveTable,
  tableCount,
  tableDimensionKeys,
  tableDimensions,
  tablePresetIds,
  tablePresets,
} from "../src/lib/family-table";
import { isSiteTextKey, siteTextDefaults } from "../src/lib/site-texts";

/** مكتبة موائد الأسر: كل اختيار ومقترح له اسم في «نصوص الموقع»، والمحفوظ القديم يكتمل بالافتراضي. */
test("the family table library is complete and every name is a site text", () => {
  assert.equal(tableCount, 18 * 3 * 8 * 6 * 5 * 3);
  for (const dim of tableDimensionKeys) {
    assert.ok(isSiteTextKey(`ftable.dim.${dim}`), dim);
    for (const opt of tableDimensions[dim])
      assert.ok(isSiteTextKey(`ftable.opt.${dim}.${opt}`), `${dim}.${opt}`);
  }
  for (const id of tablePresetIds) {
    assert.ok(isTableDesign(tablePresets[id]), id);
    assert.ok(isSiteTextKey(`ftable.preset.${id}`), id);
  }
  assert.deepEqual(
    Object.keys(tablePresets).sort(),
    [...tablePresetIds].sort(),
  );
  assert.equal(siteTextDefaults["ftable.welcome"], "حياكم الله");
  assert.deepEqual(resolveTable(undefined), defaultTable);
  assert.deepEqual(resolveTable({ shape: "round", finish: "bogus" }), {
    ...defaultTable,
    shape: "round",
  });
  assert.equal(isTableDesign({ ...defaultTable, frame: "x" }), false);
});

test("the family's own phrase is a short line without links or phone numbers", async () => {
  const { cleanWelcome } = await import("../src/server/family-table");
  assert.equal(cleanWelcome(""), null);
  assert.equal(cleanWelcome("   "), null);
  assert.equal(cleanWelcome(undefined), null);
  assert.equal(cleanWelcome("  هلا   بضيوفنا ‏ "), "هلا بضيوفنا");
  for (const bad of [
    "زورونا https://x.com",
    "www.example",
    "موقعنا jdtna.sa",
    "اتصل 0555123456",
    "اتصل ٠٥٥٥١٢٣٤٥٦",
    "<b>هلا</b>",
    "ا".repeat(41),
  ])
    assert.throws(() => cleanWelcome(bad), { status: 400 }, bad);
});
