// حالة حساب الأسرة المنتجة كما تُعرض أعلى صفحات الحساب.
export type FamilyStatusInput = {
  status: string;
  verified: boolean;
  documentId?: string | null;
  documentType?: string | null;
  documentExpiresAt?: string | null;
  reviewReason?: string | null;
};
export type FamilyState = {
  key: "review" | "active" | "incomplete" | "trusted" | "suspended";
  label: string;
  detail: string;
  reason?: string;
};

export function familyAccountState(
  input: FamilyStatusInput,
  today: string,
): FamilyState {
  const exception = input.documentType === "exception";
  const expired = Boolean(
    input.documentExpiresAt && input.documentExpiresAt.slice(0, 10) < today,
  );
  const hasEligibility = Boolean(input.documentId) || exception;
  const reason = input.reviewReason?.trim() || undefined;
  switch (input.status) {
    case "approved":
      if (input.verified && input.documentId && !exception && !expired)
        return {
          key: "trusted",
          label: "موثوق",
          detail:
            "حسابك معتمد ومستند الأهلية موثّق. منتجاتك ظاهرة للعملاء بعلامة المراجعة.",
        };
      return {
        key: "active",
        label: "نشط",
        detail: expired
          ? "حسابك نشط ومنتجاتك ظاهرة، لكن مستند الأهلية منتهي؛ حدّثه ليبقى الحساب موثوقًا."
          : "حسابك نشط ومنتجاتك ظاهرة للعملاء. أضف مستند أهلية ليصبح الحساب موثوقًا.",
      };
    case "rejected":
      return {
        key: "incomplete",
        label: "بانتظار إكمال المطلوب",
        detail:
          "راجعت الإدارة طلبك ويحتاج استكمالًا. عدّل البيانات المطلوبة ثم احفظها ليعود للمراجعة.",
        reason,
      };
    case "suspended":
      return {
        key: "suspended",
        label: "موقوف",
        detail:
          "الحساب موقوف مؤقتًا ولا تظهر منتجاتك للعملاء. تواصل مع الإدارة.",
        reason,
      };
    default:
      if (!hasEligibility || expired)
        return {
          key: "incomplete",
          label: "بانتظار إكمال المطلوب",
          detail: expired
            ? "مستند الأهلية منتهي الصلاحية. ارفع مستندًا ساريًا لإكمال المراجعة."
            : "أكمل رفع مستند الأهلية (أو طلب استثناء إداري) حتى تبدأ المراجعة.",
          reason,
        };
      return {
        key: "review",
        label: "تحت المراجعة",
        detail:
          "تم التسجيل وطلبك الآن تحت المراجعة. نبلغك عند الاعتماد، ويمكنك تجهيز منتجاتك خلال ذلك.",
      };
  }
}
