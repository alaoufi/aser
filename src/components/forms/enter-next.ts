/**
 * Enter ينقل للحقل التالي بدل إرسال النموذج (طلب المالك 2026-11-24): «إذا انتهى من حقل انتقل للحقل الذي يليه».
 * في خانة النص المتعددة الأسطر يبقى Enter سطرًا جديدًا، وعلى آخر حقل يُرسل النموذج كالمعتاد.
 * يوضع على <form onKeyDown={enterNext}>.
 */
import type { KeyboardEvent } from "react";

const FIELDS =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';

export function enterNext(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey)
    return;
  // أثناء تركيب الحروف (لوحات مفاتيح بعض اللغات) Enter يثبّت الكتابة فقط.
  if (e.nativeEvent.isComposing) return;
  const el = e.target as HTMLElement;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement))
    return;
  if (el instanceof HTMLInputElement && /^(submit|button)$/.test(el.type))
    return;
  const fields = [
    ...e.currentTarget.querySelectorAll<HTMLElement>(FIELDS),
  ].filter((f) => f.offsetParent !== null);
  const next = fields[fields.indexOf(el) + 1];
  // آخر حقل: الإرسال المعتاد.
  if (!next) return;
  e.preventDefault();
  next.focus();
  if (next instanceof HTMLInputElement && next.type !== "date") next.select?.();
}
