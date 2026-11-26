import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GUIDE_CHAPTERS,
  localizeChapters,
} from "../src/components/public/guide-content";
import { isSiteTextKey, siteTextDefaults } from "../src/lib/site-texts";

/** دليل المستخدم من «نصوص الموقع»: لكل جملة في الدليل مفتاح بنصها نفسه، وتعديله يظهر في الدليل. */
test("every guide sentence is a site text with the same default", () => {
  const d = siteTextDefaults as Record<string, string>;
  for (const c of GUIDE_CHAPTERS) {
    const k = `guide.${c.id}.`;
    const pairs: [string, string][] = [
      [k + "title", c.title],
      [k + "intro", c.intro],
      ...c.steps.map((s, i): [string, string] => [`${k}step${i + 1}`, s]),
      ...(c.tip ? [[k + "tip", c.tip] as [string, string]] : []),
      ...(c.links ?? []).map((l, i): [string, string] => [
        `${k}link${i + 1}`,
        l.label,
      ]),
    ];
    for (const [key, text] of pairs) {
      assert.ok(isSiteTextKey(key), key);
      assert.equal(d[key], text, key);
    }
  }
  assert.ok(GUIDE_CHAPTERS.some((c) => c.id === "family-table"));
});

test("an edited guide text replaces the default, and a deleted step disappears", () => {
  const texts = {
    ...(siteTextDefaults as Record<string, string>),
    "guide.family-table.title": "مائدتك",
    "guide.family-table.step2": "",
  };
  const c = localizeChapters(GUIDE_CHAPTERS, texts).find(
    (x) => x.id === "family-table",
  )!;
  const original = GUIDE_CHAPTERS.find((x) => x.id === "family-table")!;
  assert.equal(c.title, "مائدتك");
  assert.equal(c.steps.length, original.steps.length - 1);
  assert.equal(localizeChapters(GUIDE_CHAPTERS, null), GUIDE_CHAPTERS);
});
