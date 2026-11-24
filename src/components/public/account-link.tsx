"use client";
import Link from "next/link";
import {
  MemberNo,
  accountKind,
  isFamilyAccount,
  useSession,
} from "@/components/forms/session";
import { AdminPanelLink } from "./admin-panel-link";

/**
 * «حسابي»: لوحة الأسرة أو طلبات العضو. صاحب الصلاحيات الإدارية كذلك له حسابه الشخصي
 * (طلباته ومحادثاته ومعلوماته)، و«لوحة الإدارة» منفصلة عنه بجلستها.
 */
export function ownAccountHref(
  user: { role: string; familyName?: string | null } | null | undefined,
) {
  // حساب الأسرة (ومنه المدير الكامل الذي له أسرة) يفتح لوحة الأسرة.
  return user?.role === "producer" || user?.familyName
    ? "/dashboard"
    : user?.role === "courier"
      ? "/courier"
      : user
        ? "/orders"
        : "/login";
}

export function AccountLink({ className }: { className?: string }) {
  const { user } = useSession();
  // من لديه صلاحيات إدارية يرى «لوحة الإدارة» بجانب حسابه، وتفتح بضغطة (جلسة مستقلة).
  return (
    <>
      <Link href={ownAccountHref(user)} className={className}>
        {user ? "حسابي" : "تسجيل الدخول"}
      </Link>
      <AdminPanelLink className={className} />
    </>
  );
}

/** أعلى قائمة الجوال: رقم العضو فوق «مرحبًا، اسم الأسرة» حتى يكون صاحب الحساب واضحًا. */
export function AccountGreeting() {
  const { user } = useSession();
  if (!user) return null;
  return (
    <div className="menu-greeting">
      <MemberNo no={user.memberNo} />
      <p>
        مرحبًا، <strong>{user.familyName || user.name}</strong>
      </p>
      <small>{accountKind(user)}</small>
    </div>
  );
}

/** «مندوبي الخاص» في قائمة الجوال لحسابات الأسر. */
export function FamilyMenuLinks() {
  const { user } = useSession();
  if (!isFamilyAccount(user)) return null;
  return <Link href="/dashboard/couriers">مندوبي الخاص</Link>;
}
