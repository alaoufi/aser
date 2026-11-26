import type { BrandChoice } from "./brand";
export type Category = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  parentId?: string | null;
  /** مخفي من الإدارة: لا يظهر للزوار ولا في اختيار الأسر. */
  hidden?: boolean;
  /** هوية القسم: إطار بطاقات منتجاته. */
  frame?: string | null;
};
export type City = {
  id: string;
  name: string;
  regionId: string;
  regionName: string;
};
export type Producer = {
  notCookingToday?: boolean;
  /** رقم العضو (صاحب الأسرة) فوق اسمها: المميِّز لها لأن الأسماء تتكرر. */
  memberNo?: number | null;
  /** شهادة «أسرة مميزة» إن صدرت. */
  certificateId?: string | null;
  id: string;
  slug: string;
  name: string;
  description: string;
  cityId: string;
  cityName: string;
  regionName: string;
  neighborhood: string | null;
  verified: boolean;
  /** متوسط تقييم الأسرة وعدد المقيّمين (يظهر في بطاقتها). */
  ratingAverage?: number | null;
  ratingCount?: number;
  /** عدد طلباتها المقبولة والمكتملة (رقم فقط). */
  orderCount?: number;
  /** هوية الأسرة (يسري على بطاقتها وبطاقات منتجاتها). */
  brand?: BrandChoice | null;
  /** يظهر للعملاء إن اختارت الأسرة إظهاره. */
  phone: string | null;
  whatsapp: string | null;
  delivery: boolean;
  /** موقع الأسرة إن أعلنته في صفحتها. */
  publicLocation?: string | null;
  pickup: boolean;
  logoUrl: string | null;
  coverUrl: string | null;
  socialLinks: { platform: string; url: string }[];
  businessHours: string | null;
  website?: string | null;
  deliveryAreas?: { cityId: string; cityName: string; fee: number | null }[];
};
export type Product = {
  /** عدد طلباته المقبولة والمكتملة (رقم فقط). */
  orderCount?: number;
  /** لصاحب المنتج فقط: ظاهر للزوار؟ ومن أخفاه (الأسرة أو الإدارة). */
  visible?: boolean;
  hiddenBy?: "admin" | "family" | "docs" | null;
  notCookingToday?: boolean;
  id: string;
  producerId: string;
  /** هوية الأسرة: منتجاتها تأخذ نفس هويتها، داخل إطار قسمها. */
  brand?: BrandChoice | null;
  primaryCategory?: string | null;
  frame?: string | null;
  producerName: string;
  producerSlug: string;
  cityName: string;
  name: string;
  description: string;
  price: number | null;
  unit: string;
  status: "available" | "unavailable" | "preorder";
  imageUrl: string | null;
  categoryIds: string[];
  allergens: string[];
  ingredients: string | null;
  storage: string | null;
  shelfLife: string | null;
  preparationTime: string | null;
  story: string | null;
  delivery: boolean;
  /** التسليم المباشر من موقع الأسرة. */
  pickup?: boolean;
  /** داخل نطاق التغطية، أو جميع مناطق المملكة بالشحن. */
  deliveryScope?: "coverage" | "kingdom";
  /** رسوم الشحن تضاف على السعر (للشحن لكل المملكة). */
  shippingFee?: number | null;
};
export type Filters = {
  region?: string;
  q?: string;
  city?: string;
  category?: string;
  status?: string;
  delivery?: string;
  /** slug أسرة لعرض منتجاتها فقط */
  producer?: string;
  /** "all" يشمل غير المتوفر؛ الافتراضي يعرض المتاح والطلب المسبق */
  include?: string;
  /** "any" يوسّع البحث: يكفي تطابق كلمة واحدة */
  match?: string;
  page?: number;
  /** "kingdom": ما يُشحن لكل المناطق فقط. */
  scope?: string;
  /** يستبعد منتجات أسر هذه المنطقة/المدينة (حتى لا تتكرر بين القسمين). */
  notRegion?: string;
  notCity?: string;
  /** فلاتر العضو أعلى الصفحة («مشابه لمنتجاتي»، «منطقتي»، «حسب تغطيتي»)؛ تُحسب في الخادم. */
  mine?: MineFilters | null;
};
/** ما تحصره فلاتر العضو (src/server/member-scope.ts). */
export type MineFilters = {
  /** أقسام المنتجات المطلوبة (يكفي أحدها). مصفوفة فارغة = لا شيء يطابق. */
  categories?: string[];
  /** مدن الأسر المسموحة (تغطية المندوب). */
  cities?: string[];
  /** منطقة الأسر (منطقتي). */
  region?: string;
  /** يستبعد منتجات الأسرة نفسها من «مشابه لمنتجاتي». */
  excludeProducer?: string;
};
export type SessionUser = {
  id: string;
  name: string;
  phone: string;
  role: "customer" | "producer" | "admin" | "staff" | "courier";
  username?: string | null;
  /** رقم العضو المعروض فوق اسمه: المميِّز له لأن الأسماء تتكرر. */
  memberNo?: number | null;
  /** صلاحيات المشرف (staff) فقط. */
  permissions?: string[];
  /** اسم الأسرة المنتجة (الاسم التجاري) لصاحب الحساب إن كان له ملف أسرة: للترحيب الواضح. */
  familyName?: string | null;
  /** ملف الأسرة معتمد: «طلبات العملاء» و«مندوبي الخاص» تظهر بعد الاعتماد فقط (الخادم يرفضها قبله). */
  familyApproved?: boolean;
  /** في الجلسة الشخصية: له صلاحيات إدارية، فيظهر له رابط «لوحة الإدارة» فقط (الصلاحيات نفسها في جلسة اللوحة). */
  adminAccess?: boolean;
};
