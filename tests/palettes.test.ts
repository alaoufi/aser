import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PALETTES } from "../src/lib/appearance";

/**
 * «ألوان الموقع» التراثية (2026-11-25): كل لوحة في palettes.css تحقق تباين 4.5:1 على الأقل
 * للنص والأزرار، وكل لوحة في الاختيار لها قواعد في الملف (والأصلية «السدو» من heritage.css).
 */
const css = readFileSync("src/app/palettes.css", "utf8");
const heritage = readFileSync("src/app/heritage.css", "utf8");
const vars = (block: string) =>
  Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [
      m[1],
      m[2],
    ]),
  );
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((x) =>
    x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test("every heritage palette keeps text and buttons readable (4.5:1)", () => {
  const root = heritage.indexOf(":root {");
  const sadu = vars(heritage.slice(root, heritage.indexOf("}", root)));
  for (const { key } of PALETTES) {
    const block =
      key === "sadu"
        ? null
        : css.match(
            new RegExp(`data-palette="${key}"\\]\\s*\\{([^}]*)\\}`),
          )?.[1];
    assert.ok(key === "sadu" || block, `قواعد ${key} موجودة`);
    const v = { ...sadu, ...(block ? vars(block) : {}) };
    const pairs: [string, string, string][] = [
      ["ink", "paper", "النص على الخلفية"],
      ["muted", "paper", "النص الثانوي على الخلفية"],
      ["muted", "surface", "النص الثانوي على البطاقات"],
      ["olive", "paper", "اللون الأساسي على الخلفية"],
      ["rust", "surface", "لون التمييز على البطاقات"],
      ["ink", "header-bg", "النص على الترويسة"],
    ];
    for (const [fg, bg, what] of pairs)
      assert.ok(
        ratio(v[fg], v[bg]) >= 4.5,
        `${key}: ${what} ${ratio(v[fg], v[bg]).toFixed(2)}`,
      );
    // نص الأزرار: أبيض، إلا في «ليلي» حيث الأزرار فاتحة بنص داكن (--on-accent).
    const onAccent = v["on-accent"] ?? "#ffffff";
    for (const btn of ["olive", "rust"])
      assert.ok(
        ratio(onAccent, v[btn]) >= 4.5,
        `${key}: نص الزر على ${btn} ${ratio(onAccent, v[btn]).toFixed(2)}`,
      );
  }
});

test("the high-contrast palette goes beyond AA (7:1 for text and buttons)", () => {
  const block = css.match(/data-palette="contrast"\]\s*\{([^}]*)\}/)?.[1];
  assert.ok(block);
  const v = vars(block);
  for (const [fg, bg] of [
    ["ink", "paper"],
    ["muted", "paper"],
    ["olive", "paper"],
    ["rust", "surface"],
  ])
    assert.ok(ratio(v[fg], v[bg]) >= 7, `${fg}/${bg} ${ratio(v[fg], v[bg])}`);
  assert.ok(ratio("#ffffff", v.olive) >= 7);
  // عناوين التذييل الأسود.
  const h3 = css.match(
    /data-palette="contrast"\] \.site-footer h3 \{\s*color: (#[0-9a-f]{6})/,
  )?.[1];
  assert.ok(h3 && ratio(h3, v.footer) >= 7, "عناوين التذييل");
});

test("the night palette is dark and keeps the footer readable", () => {
  const block = css.match(/data-palette="lail"\]\s*\{([^}]*)\}/)?.[1];
  assert.ok(block);
  const v = vars(block);
  assert.ok(lum(v.paper) < 0.02, "خلفية داكنة");
  assert.ok(ratio("#e3d0b7", v.footer) >= 4.5, "نص التذييل");
  assert.ok(ratio(v["tint-ink"], v.tint) >= 4.5, "النص على البطاقات الملونة");
});
