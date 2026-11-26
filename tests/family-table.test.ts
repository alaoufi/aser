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
  assert.equal(tableCount, 6 * 2 * 8 * 6 * 5 * 3);
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
