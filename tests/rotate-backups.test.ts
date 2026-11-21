import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * تدوير النسخ (infra/rotate-backups.py) على مجلد مؤقت بدل /var/backups/jdatna:
 * آخر 10 يومية، وآخر 5 يدوية، وآخر 2 من نسخ الأمان المؤقتة قبل النشر (طلب المالك 2026-11-22)،
 * ولا تُحذف أحدث نسخة أبدًا، وتُحذف علامات الملف (.sha256 و.daily و.safety) معه.
 */
test("rotation keeps 10 daily, 5 manual and 2 temporary safety copies, with their marks", () => {
  const root = mkdtempSync(join(tmpdir(), "rotate-"));
  try {
    const script = readFileSync("infra/rotate-backups.py", "utf8").replace(
      "pathlib.Path('/var/backups/jdatna')",
      `pathlib.Path(${JSON.stringify(root)})`,
    );
    assert.ok(script.includes(root), "path replaced");
    const make = (day: number, hour: number, mark?: "daily" | "safety") => {
      const name = `jdatna-202611${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}0000Z.tar.gpg`;
      writeFileSync(join(root, name), "x");
      writeFileSync(join(root, `${name}.sha256`), "x");
      if (mark) writeFileSync(join(root, `${name}.${mark}`), "");
      return name;
    };
    for (let d = 1; d <= 12; d++) make(d, 2, "daily");
    for (let d = 1; d <= 7; d++) make(d, 10);
    for (let d = 20; d <= 22; d++) make(d, 20, "safety");
    execFileSync("python3", ["-c", script]);
    const left = readdirSync(root);
    const backups = left.filter((f) => f.endsWith(".tar.gpg"));
    const marked = (mark: string) =>
      backups.filter((f) => left.includes(`${f}.${mark}`));
    assert.equal(marked("daily").length, 10);
    assert.equal(marked("safety").length, 2);
    assert.equal(
      backups.length - marked("daily").length - marked("safety").length,
      5,
    );
    // أحدث نسخة (نسخة أمان) باقية، وأقدم اليومية حُذفت مع علاماتها.
    assert.ok(backups.includes("jdatna-20261122T200000Z.tar.gpg"));
    assert.ok(!left.some((f) => f.startsWith("jdatna-20261101T020000Z")));
    // لا علامة يتيمة بلا ملفها.
    for (const f of left)
      if (!f.endsWith(".tar.gpg"))
        assert.ok(
          backups.includes(f.replace(/\.(sha256|daily|safety)$/, "")),
          f,
        );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
