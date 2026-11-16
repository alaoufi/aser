import { NextResponse, type NextRequest } from "next/server";
import { floodBucket, floodCheck } from "./lib/flood";

/**
 * الحماية من الإغراق أمام كل الصفحات والـ API: حد في الدقيقة لكل عنوان زائر (lib/flood).
 * عنوان الزائر آخر قيمة في X-Forwarded-For تضعها البوابة؛ بلا عنوان (تشغيل محلي) لا حد.
 */
export function proxy(request: NextRequest) {
  const ip = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .at(-1);
  if (!ip) return NextResponse.next();
  const path = request.nextUrl.pathname;
  const bucket = floodBucket(request.method, path);
  const result = floodCheck(ip, bucket);
  if (result.ok) return NextResponse.next();
  if (result.first) {
    // أول رفض في النافذة فقط يُسجَّل في «التقرير الأمني».
    void import("./server/security-events")
      .then(({ recordSecurityEvent }) =>
        recordSecurityEvent("rate_limited", {
          request,
          detail: `flood-${bucket}`,
        }),
      )
      .catch(() => {});
  }
  const headers = {
    "Retry-After": String(result.retryAfter),
    "Cache-Control": "no-store",
  };
  return path.startsWith("/api/")
    ? NextResponse.json(
        { error: "طلبات كثيرة جدًا، انتظر قليلًا ثم حاول مجددًا" },
        { status: 429, headers },
      )
    : new NextResponse(
        "طلبات كثيرة جدًا من هذا الاتصال. انتظر دقيقة ثم أعد المحاولة.",
        {
          status: 429,
          headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
        },
      );
}

export const config = {
  // كل شيء عدا ملفات Next الداخلية (_next: الثابتة وإعادة التحميل في التطوير) والملفات الثابتة.
  matcher: [
    "/((?!_next/|__nextjs|favicon|brand/|food/|fonts/|icons/|.*\\.(?:png|jpg|jpeg|webp|svg|ico|gif|woff2?|txt|xml|js|css|json|webmanifest)$).*)",
  ],
};
