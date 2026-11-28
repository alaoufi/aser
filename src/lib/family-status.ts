// حالة حساب الأسرة المنتجة كما تُعرض أعلى صفحات الحساب.
export type FamilyStatusInput = {
  status: string;
  verified: boolean;
  documentId?: string | null;
  documentType?: string | null;
  documentExpiresAt?: string | null;
  reviewReason?: string | null;
  /** complete: مكتمل الشروط؛ exempt: مستثنى من الشروط (قرار المالك 2026-11-27). */
  docsStatus?: string | null;
  /** سبب «الإخفاء» من الإدارة (2026-11-28). */
  hiddenReason?: string | null;
};
export type FamilyState = {
  key:
    | "review"
    | "active"
    | "incomplete"
    | "trusted"
    | "suspended"
    | "closed"
    | "hidden";
  label: string;
  detail: string;
  reason?: string;
  /** مباركة الاعتماد (من «نصوص الموقع») تظهر أعلى لوحة الأسرة شهرًا بعد اعتمادها. */
  congrats?: string;
};

export function familyAccountState(
  input: FamilyStatusInput,
  today: string,
): FamilyState {
  const exception = input.documentType === "exception";
  const expired = Boolean(
    input.documentExpiresAt && input.documentExpiresAt.slice(0, 10) < today,
  );
  const reason = input.reviewReason?.trim() || undefined;
  switch (input.status) {
    case "approved":
      // «تم استكمال المطلوب»: مكتمل الشروط ولو لم يُرفع مستند في الموقع.
      if (input.docsStatus === "complete")
        return {
          key: "trusted",
          label: "مكتمل الشروط",
          detail:
            "حسابك معتمد ومكتمل الشروط. منتجاتك ظاهرة للعملاء بعلامة المراجعة.",
        };
      if (input.verified && input.documentId && !exception && !expired)
        return {
          key: "trusted",
          label: "موثوق",
          detail:
            "حسابك معتمد ومستند الأهلية موثّق. منتجاتك ظاهرة للعملاء بعلامة المراجعة.",
        };
      // الاعتماد أنهى المراجعة (قرار المالك 2026-11-17): لا مطالبة بنواقص بعده.
      // ملاحظات النواقص تبقى عند الإدارة في «من لديهم نواقص».
      return {
        key: "active",
        label: "نشط",
        detail: "حسابك معتمد ونشط، ومنتجاتك ظاهرة للعملاء.",
      };
    case "rejected":
      return {
        key: "incomplete",
        label: "بانتظار إكمال المطلوب",
        detail:
          "راجعت الإدارة طلبك ويحتاج استكمالًا. عدّل البيانات المطلوبة ثم احفظها ليعود للمراجعة.",
        reason,
      };
    // قرار المالك 2026-11-26: الأسرة تحوّلت إلى عميل؛ صفحتها ومنتجاتها مخفية ومحفوظة حتى تعود.
    case "closed":
      return {
        key: "closed",
        label: "تحوّلت إلى عميل",
        detail:
          "حسابك الآن حساب عميل، وصفحة أسرتك ومنتجاتها مخفية ومحفوظة. تعود كما كانت من «معلوماتي».",
      };
    // قرار المالك 2026-11-28: أخفتها الإدارة عن الزوار مؤقتًا حتى يُصلح وضعها.
    case "hidden":
      return {
        key: "hidden",
        label: "مخفية مؤقتًا",
        detail:
          "أخفت الإدارة أسرتك ومنتجاتها عن الزوار مؤقتًا. أصلح ما طلبته الإدارة، وتعود ظاهرة بعد مراجعتها.",
        reason: input.hiddenReason?.trim() || reason,
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
      if (expired)
        return {
          key: "incomplete",
          label: "بانتظار إكمال المطلوب",
          detail:
            "مستند الأهلية منتهي الصلاحية. ارفع مستندًا ساريًا لإكمال المراجعة.",
          reason,
        };
      // التسجيل مقبول دون مستند؛ إرفاقه يسرّع الاعتماد.
      return {
        key: "review",
        label: "تحت المراجعة",
        detail:
          input.documentId || exception
            ? "تم التسجيل وطلبك الآن تحت المراجعة. نبلغك عند الاعتماد، ويمكنك تجهيز منتجاتك خلال ذلك."
            : "تم التسجيل وطلبك الآن تحت المراجعة. إرفاق شهادة أو صورة الهوية الوطنية يسرّع الاعتماد، ويمكنك تجهيز منتجاتك خلال ذلك.",
        reason,
      };
  }
}
