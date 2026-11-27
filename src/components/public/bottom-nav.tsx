"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isFamilyAccount, useSession } from "@/components/forms/session";
import { ownAccountHref } from "./account-link";
import { useUnread } from "./message-alert";

/**
 * القائمة السفلية على الجوال (قرار المالك 2026-11-22، مثل «أي خدمة»):
 * الرئيسية، دليلي، (+)، المحادثات، حسابي. زر (+) حسب الحساب:
 *   - الأسرة: «إضافة منتج». - العميل: «اطلب» (طلبات العملاء). - المندوب: «طلباتي» (توصيلاته).
 *   - الزائر: «اطلب» و«دليلي» و«المحادثات» تفتح تسجيل الدخول.
 * لا تظهر في لوحة الإدارة ولا على الشاشة العريضة.
 */
export function BottomNav({ guest = false }: { guest?: boolean }) {
  const { user, ready } = useSession();
  const path = usePathname() ?? "/";
  const unread = useUnread();
  if (path === "/admin" || path.startsWith("/admin/")) return null;
  // شاشة تحديث التطبيق القديم: لا قائمة سفلية (لا مواصلة إلا بالتحديث).
  if (path === "/update-app") return null;
  // تظهر بعد معرفة الحساب، حتى لا يُضغط زر الزائر («دخول») لعضو مسجّل. ثابتة أسفل الشاشة فلا تزيح شيئًا.
  // والزائر بلا جلسة (يعرفه الخادم من الكوكي) تظهر له فورًا مع أول رسم.
  if (!ready && !guest) return null;
  const family = isFamilyAccount(user);
  const plus = !user
    ? { href: "/login", label: "اطلب" }
    : family
      ? { href: "/dashboard/products?new=1", label: "إضافة منتج" }
      : user.role === "courier"
        ? { href: "/courier", label: "طلباتي" }
        : { href: "/requests?new=1", label: "اطلب" };
  const account = ownAccountHref(user);
  const on = (href: string) =>
    href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
  const item = (
    href: string,
    label: string,
    icon: React.ReactNode,
    extra?: React.ReactNode,
    ariaLabel?: string,
  ) => (
    <Link
      href={href}
      className="bottom-nav-item"
      aria-current={on(href) ? "page" : undefined}
      aria-label={ariaLabel}
    >
      <span className="bottom-nav-icon" aria-hidden="true">
        {icon}
        {extra}
      </span>
      <span>{label}</span>
    </Link>
  );
  const svg = (d: string) => (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
  return (
    <nav className="bottom-nav" aria-label="القائمة السفلية">
      {item("/", "الرئيسية", svg("M4 11 12 4l8 7v9H5v-9M10 20v-5h4v5"))}
      {item(
        user ? "/directory" : "/login",
        "دليلي",
        svg("M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z"),
      )}
      <Link
        href={plus.href}
        className="bottom-nav-plus"
        aria-label={plus.label}
      >
        <span className="bottom-nav-plus-circle" aria-hidden="true">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="28"
            height="28"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        <span>{plus.label}</span>
      </Link>
      {item(
        user ? "/messages" : "/login",
        "المحادثات",
        svg("M4 5h16v11H9l-5 4z"),
        unread > 0 ? (
          <span className="bottom-nav-badge">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null,
        // المحادثات صارت هنا وحدها على الجوال (قرار المالك 2026-11-27): العدد يُقرأ مع الاسم كما في الرأس.
        user && unread > 0 ? `المحادثات، ${unread} رسالة جديدة` : undefined,
      )}
      {item(
        account,
        user ? "حسابي" : "دخول",
        svg("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0"),
      )}
    </nav>
  );
}
