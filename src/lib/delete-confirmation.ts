/**
 * كلمة تأكيد حذف الحساب: «حذف حسابي»، أو DELETE لمن لا يملك لوحة مفاتيح عربية
 * (مراجع Apple مثلًا؛ شرط حذف الحساب من داخل التطبيق 5.1.1(v)).
 */
export const DELETE_CONFIRMATION = "حذف حسابي";
export const DELETE_CONFIRMATION_LATIN = "DELETE";
export function isDeleteConfirmation(text: string) {
  const value = text.trim();
  return (
    value === DELETE_CONFIRMATION ||
    value.toUpperCase() === DELETE_CONFIRMATION_LATIN
  );
}
