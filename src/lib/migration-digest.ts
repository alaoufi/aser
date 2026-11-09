import { createHash } from "node:crypto";

const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

// بصمات مكافئة لملف ترحيل: نفس SQL بنهايات أسطر مختلفة فقط (LF أو CRLF أو CR).
// .gitattributes يحوّل الملفات إلى LF عند الحفظ، بينما طُبّقت النسخ الأولى في الإنتاج
// بنهايات Windows. أي اختلاف في المحتوى نفسه يبقى مرفوضًا.
export function equivalentDigests(sql: string): Set<string> {
  const lf = sql.replace(/\r\n?/g, "\n");
  const lines = lf.split("\n");
  const variants = new Set<string>([
    sql,
    lf,
    lines.join("\r\n"),
    lines.join("\r"),
  ]);
  // ملف آخره سطر واحد بنهاية مختلفة فقط (حرف رجوع زائد أو ناقص في النهاية).
  for (const v of [...variants]) {
    variants.add(v.replace(/[\r\n]+$/, ""));
    variants.add(v.replace(/[\r\n]+$/, "") + "\r\n");
    variants.add(v.replace(/[\r\n]+$/, "") + "\n");
  }
  return new Set([...variants].map(sha256));
}

/** هل البصمة المسجلة في الإنتاج تطابق الملف الحالي (مع اختلاف نهايات الأسطر فقط) أو بصمة قديمة مراجَعة صراحةً؟ */
export function digestMatches(
  stored: string,
  sql: string,
  reviewedLegacy: readonly string[] = [],
): boolean {
  return equivalentDigests(sql).has(stored) || reviewedLegacy.includes(stored);
}
export { sha256 as migrationSha256 };
