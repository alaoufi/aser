"use client";
import Link from "next/link";
import { useSession } from "@/components/forms/shared";
import { isManager } from "@/lib/permissions";

/**
 * «حسابي الخاص»: لوحة الأسرة أو طلبات العضو. المدير الكامل كذلك له حسابه الخاص
 * (طلباته ومحادثاته ومعلوماته)، و«حساب الإدارة» منفصل عنه.
 */
export function ownAccountHref(user: { role: string } | null | undefined) {
  return user?.role === "producer"
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
    <p className="menu-greeting">
      مرحبًا، <strong>{user.familyName || user.name}</strong>
    </p>
  );
}
