import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PALETTES } from "../src/components/public/appearance-picker";

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
    for (const btn of ["olive", "rust"])
      assert.ok(ratio("#ffffff", v[btn]) >= 4.5, `${key}: نص الزر على ${btn}`);
  }
});
