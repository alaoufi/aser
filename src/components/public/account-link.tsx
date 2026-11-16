"use client";
import Link from "next/link";
import {
  accountKind,
  isFamilyAccount,
  useSession,
} from "@/components/forms/shared";
import { isManager } from "@/lib/permissions";

/**
 * «حسابي الخاص»: لوحة الأسرة أو طلبات العضو. المدير الكامل كذلك له حسابه الخاص
 * (طلباته ومحادثاته ومعلوماته)، و«حساب الإدارة» منفصل عنه.
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
  // من لديه صلاحيات إدارية (والمدير الكامل) يرى حسابين: حسابه الخاص، وحساب الإدارة.
  const both = isManager(user);
  return (
    <>
      <Link href={ownAccountHref(user)} className={className}>
        {user ? (both ? "حسابي الخاص" : "حسابي") : "تسجيل الدخول"}
      </Link>
      {both && (
        <Link href="/admin" className={className}>
          حساب الإدارة
        </Link>
      )}
    </>
  );
}

/** أعلى قائمة الجوال: «مرحبًا، اسم الأسرة» حتى يكون صاحب الحساب واضحًا. */
export function AccountGreeting() {
  const { user } = useSession();
  if (!user) return null;
  return (
    <div className="menu-greeting">
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
