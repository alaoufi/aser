"use client";
/**
 * الجلسة وطلبات الـ API على المتصفح، بلا أي تنسيق (مراجعة السرعة 2026-11-24).
 * كانت في shared.tsx الذي يستورد account.module.css (54KB)، فيدخل ذلك الملف كل صفحة لأن مكوّنات
 * الصفحة العامة (القائمة السفلية، التنبيهات…) تحتاج useSession وapi فقط. تُستورد من هنا في المكوّنات العامة.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import type { SessionUser } from "@/lib/types";
import {
  siteTextDefaults,
  type SiteTextKey,
  type SiteTexts,
} from "@/lib/site-texts";
/**
 * قراءات تُطلب مبكرًا (warmApi) ويتشاركها من يطلب العنوان نفسه خلال ثوانٍ: شارة حالة الأسرة وزر
 * المشاركة كانا يطلبان الحالة مرتين، وبطاقات لوحة الأسرة كانت تبدأ بعد وصول الملف لا معه.
 * للعناوين المطلوبة صراحة فقط، وأي حفظ (طلب غير GET) يمسحها فلا تُعرض قراءة قديمة بعده.
 */
const WARM_MS = 5000;
const warm = new Map<string, { at: number; p: Promise<unknown> }>();
const warmed = (url: string) => {
  const w = warm.get(url);
  return w && Date.now() - w.at < WARM_MS ? w.p : null;
};
export function warmApi(...urls: string[]) {
  for (const url of urls) {
    if (warmed(url)) continue;
    const p = request<unknown>(url);
    warm.set(url, { at: Date.now(), p });
    // فشل القراءة المبكرة لا يُحفظ: الطالب التالي يطلبها من جديد ويعرض خطأه هو.
    p.catch(() => {
      if (warm.get(url)?.p === p) warm.delete(url);
    });
  }
}
/** قراءة تغيّرت بغير api (حدث من الصفحة): تُطلب من الخادم في المرة التالية. */
export function dropWarm(url: string) {
  warm.delete(url);
}
/**
 * `saved`: نص رسالة النجاح أسفل الشاشة بحسب المصطلح (قرار المالك 2026-11-23):
 * «تمت إضافة المنتج»، «تم حفظ التعديلات»، «تم نشر طلبك»… أو false لإخفائها.
 * بلا نص: «تم الحذف» للحذف، و«تم الحفظ» لغيره.
 */
export type ApiOptions = RequestInit & { saved?: string | false };
export function api<T>(url: string, options?: ApiOptions): Promise<T> {
  if (!options) {
    const p = warmed(url);
    if (p) return p as Promise<T>;
  } else if (options.method && options.method !== "GET") warm.clear();
  return request<T>(url, options);
}
async function request<T>(url: string, opts?: ApiOptions): Promise<T> {
  const { saved, ...options } = opts ?? {};
  const r = await fetch(url, {
    ...options,
    headers:
      options?.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await r.json().catch(() => ({}));
  // الدخول والخروج وحذف الحساب تغيّر الجلسة: تُنسى الجلسة المحفوظة.
  if (
    options?.method &&
    options.method !== "GET" &&
    SESSION_CHANGERS.some((p) => url.startsWith(p))
  )
    forgetSession();
  // 401 والحساب معروض كمسجَّل: قد تكون الجلسة انتهت. يُسأل الخادم (مرة كل 10 ثوانٍ على الأكثر)
  // وجوابه يحسم؛ لا تُنسى الجلسة هنا حتى لا تتقلب الصفحة بين مسجَّل وغير مسجَّل.
  else if (
    r.status === 401 &&
    known?.user &&
    !url.startsWith("/api/session") &&
    Date.now() - lastRecheck > 10_000
  ) {
    lastRecheck = Date.now();
    void loadSession(true).catch(() => {});
  }
  if (!r.ok)
    // البيانات مع الخطأ: الخادم قد يطلب تأكيدًا (confirm) قبل إجراء له أثر.
    throw Object.assign(
      new Error(data.error || "تعذر إتمام الطلب. يرجى المحاولة مجددًا."),
      { status: r.status, data },
    );
  announceSaved(url, options?.method, saved);
  return data as T;
}
/** يُبث بعد كل حفظ ناجح لتظهر رسالة «تم الحفظ» أسفل الشاشة. */
export const SAVED_EVENT = "jdatna:saved";
/** عمليات ليست «حفظًا» يراه المستخدم: الرسائل، والدخول، والإشعارات، والفحص. */
const NOT_A_SAVE = [
  "/api/conversations",
  "/api/auth",
  "/api/logout",
  "/api/push",
  "/api/coverage/check",
  "/api/account/delete",
  "/api/producer/orders/alerts",
  "/api/session",
];
function announceSaved(url: string, method = "GET", saved?: string | false) {
  const m = method.toUpperCase();
  if (m === "GET" || saved === false || typeof window === "undefined") return;
  const path = url.split("?")[0];
  if (NOT_A_SAVE.some((p) => path.startsWith(p))) return;
  window.dispatchEvent(
    new CustomEvent(SAVED_EVENT, {
      detail: saved || (m === "DELETE" ? "تم الحذف" : "تم الحفظ"),
    }),
  );
}
type SessionData = { user: SessionUser | null; registrationOpen: boolean };
const SESSION_CHANGERS = ["/api/auth", "/api/logout", "/api/account/delete"];
/**
 * آخر جلسة معروفة: تُعرض فورًا عند فتح أي صفحة (بلا انتظار «جارٍ التحقق من الحساب»)، ثم
 * تُحدَّث من الخادم في الخلفية. للعرض فقط؛ الصلاحيات يفرضها الخادم في كل طلب.
 * تُحفظ في الجهاز (localStorage) فتُعرض أيضًا عند فتح التطبيق من جديد، فتبدأ طلبات بيانات الصفحة
 * فورًا بدل انتظار رد الجلسة. تُنسى عند الخروج وانتهاء الجلسة، ولا تُعتمد بعد 30 يومًا.
 */
const SESSION_KEY = "jdatna:session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
/**
 * داخل «لوحة الإدارة» (/admin): الجلسة هي جلسة اللوحة (الخادم يميّزها من الصفحة)، ولا تُحفظ في الجهاز
 * ولا تختلط بالجلسة الشخصية المحفوظة. الدخول للوحة والخروج منها تحميل كامل للصفحة.
 */
export function inAdminArea() {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname;
  return p === "/admin" || p.startsWith("/admin/");
}
let lastRecheck = 0;
let known: SessionData | null = null;
function recall(): SessionData | null {
  if (known) return known;
  if (inAdminArea()) return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const d = raw
      ? (JSON.parse(raw) as SessionData & { savedAt?: number })
      : null;
    if (
      d &&
      typeof d === "object" &&
      "user" in d &&
      Date.now() - (d.savedAt ?? 0) < SESSION_MAX_AGE
    )
      known = { user: d.user, registrationOpen: d.registrationOpen };
  } catch {
    // التخزين محجوب (تصفح خاص): تعمل الصفحة بطلب الجلسة كالمعتاد.
  }
  return known;
}
function remember(d: SessionData) {
  // الكائن نفسه يبقى إن لم يتغير شيء، فلا تُعاد تحميلات تعتمد عليه.
  if (
    known &&
    known.registrationOpen === d.registrationOpen &&
    sameUser(known.user, d.user)
  )
    return;
  known = d;
  for (const notify of sessionListeners) notify();
  if (inAdminArea()) return;
  try {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ ...d, savedAt: Date.now() }),
    );
  } catch {
    // لا تخزين: تبقى في ذاكرة الصفحة فقط.
  }
}
export function forgetSession() {
  // المعروض في الصفحة الحالية يبقى كما هو (يتبعه تحميل كامل: رسالة «حُذف حسابك» أو الانتقال)،
  // والمنسي هو المحفوظ للصفحات التالية.
  sessionRequest = null;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // لا تخزين.
  }
}
/** آخر جلسة معروفة في الجهاز إن وُجدت (للعرض وبدء القراءات مبكرًا؛ الخادم يحسم الصلاحية). */
export function knownSession() {
  return recall();
}
/** بعد دخول ناجح: الصفحة التالية تعرض الحساب فورًا ثم تتحقق منه في الخلفية. */
export function primeSession(user: SessionUser) {
  remember({ user, registrationOpen: known?.registrationOpen ?? true });
}
/**
 * طلب الجلسة مشترك بين كل مكوّنات الصفحة: كانت صفحة الإدارة وحدها تطلبه 11 مرة.
 * يُعاد استخدام الطلب نفسه دقيقة (كان 4 ثوانٍ فيُطلب مع أغلب التنقلات)، والدخول والخروج يطلبانه من جديد فورًا.
 */
let sessionRequest: { at: number; p: Promise<SessionData> } | null = null;
export function loadSession(fresh = false) {
  if (fresh || !sessionRequest || Date.now() - sessionRequest.at > 60_000) {
    const p = api<SessionData>("/api/session");
    const mine = { at: Date.now(), p };
    sessionRequest = mine;
    p.then(
      (d) => {
        // رد طلب أُلغي بدخول أو خروج بعده لا يُحفظ.
        if (sessionRequest === mine) remember(d);
      },
      () => {
        if (sessionRequest === mine) sessionRequest = null;
      },
    );
  }
  return sessionRequest.p;
}
/** مقارنة بالقيم لا بترتيب الحقول، والحقل الفارغ كالغائب (رد الدخول ورد الجلسة يختلفان شكلًا). */
const canonical = (u: SessionUser | null) =>
  u &&
  JSON.stringify(
    Object.entries(u)
      .filter(([, v]) => v !== null && v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );
const sameUser = (a: SessionUser | null, b: SessionUser | null) =>
  canonical(a) === canonical(b);
/** مكوّنات الصفحة تتابع «آخر جلسة معروفة»؛ تتحدث كلها معًا عند تغيّرها. */
const sessionListeners = new Set<() => void>();
const subscribeSession = (notify: () => void) => {
  sessionListeners.add(notify);
  return () => {
    sessionListeners.delete(notify);
  };
};
export function useSession() {
  // أثناء ربط صفحة الخادم (hydration) تُعامل الجلسة كغير معروفة ليطابق الرسم ما أرسله الخادم،
  // ثم تظهر الجلسة المعروفة مباشرة. في التنقل داخل الموقع تُعرض من أول رسم.
  const snapshot = useSyncExternalStore(
    subscribeSession,
    () => known,
    () => null,
  );
  const [error, setError] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    // بعد تحميل كامل للصفحة أو فتح التطبيق: الجلسة المحفوظة في الجهاز تُعرض قبل رد الخادم.
    if (!known && recall()) for (const notify of sessionListeners) notify();
    loadSession().catch((e) => {
      if (!active) return;
      setError(e.message);
      setFailed(true);
    });
    return () => {
      active = false;
    };
  }, []);
  return {
    user: snapshot?.user ?? null,
    ready: Boolean(snapshot) || failed,
    open: snapshot?.registrationOpen ?? false,
    error,
  };
}
/** حساب أسرة: دوره أسرة منتجة، أو له ملف أسرة (مثل المدير الكامل). */
export function isFamilyAccount(user: SessionUser | null | undefined) {
  return Boolean(user && (user.role === "producer" || user.familyName));
}
/** أسرة لم تُعتمد بعد: تُخفى عنها أقسام تتطلب الاعتماد بدل أن تفتح على رسالة رفض (مراجعة 2026-11-24). */
export function familyPending(user: SessionUser | null | undefined) {
  return isFamilyAccount(user) && user?.familyApproved === false;
}
/** نوع الحساب كما يُكتب تحت الاسم. */
export function accountKind(user: SessionUser) {
  if (user.role === "courier") return "حساب مندوب";
  if (isFamilyAccount(user)) return "حساب أسرة منتجة";
  // الحساب الخاص منفصل عن حساب الإدارة: صاحب الصلاحيات هنا عضو كغيره.
  return "حساب عميل";
}
/** رقم العضو فوق الاسم: المميِّز له لأن الأسماء تتكرر (قرار المالك 2026-11-22). */
export function MemberNo({ no }: { no?: number | null }) {
  if (!no) return null;
  return (
    <span className="member-no" title="رقم العضو">
      رقم العضو <b dir="ltr">{no}</b>
    </span>
  );
}

/**
 * نصوص الموقع في الواجهات التي تُرسم في المتصفح (قاعدة المالك 2026-11-25: كل كلمة أو جملة في
 * «نصوص الموقع»). tx(المفتاح، {قيم}) يعيد النص المعدَّل أو الأصلي، و«» إن أخفته الإدارة؛
 * و{اسم} في النص يُستبدل بقيمته. txb للأزرار: لا يُخفى، فيعود للأصل إن حُذف.
 */
export function useSiteTexts() {
  const [texts, setTexts] = useState<Partial<SiteTexts> | null>(null);
  useEffect(() => {
    let live = true;
    api<{ texts: SiteTexts }>("/api/site-texts")
      .then((d) => live && setTexts(d.texts))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const fill = (text: string, vars?: Record<string, string | number>) =>
    vars
      ? text.replace(/\{(\w+)\}/g, (m, k: string) =>
          k in vars ? String(vars[k]) : m,
        )
      : text;
  const tx = (key: SiteTextKey, vars?: Record<string, string | number>) =>
    fill(texts?.[key] ?? siteTextDefaults[key], vars);
  const txb = (key: SiteTextKey, vars?: Record<string, string | number>) =>
    fill(texts?.[key] || siteTextDefaults[key], vars);
  return { tx, txb, ready: texts !== null };
}
