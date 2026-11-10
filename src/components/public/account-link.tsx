"use client";
import Link from "next/link";
import { useSession } from "@/components/forms/shared";
import { isManager } from "@/lib/permissions";

/** «حسابي الخاص»: لوحة الأسرة أو طلبات العضو (المدير الكامل: الإدارة). */
export function ownAccountHref(user: { role: string } | null | undefined) {
  return user?.role === "admin"
    ? "/admin"
    : user?.role === "producer"
      ? "/dashboard"
      : user
        ? "/orders"
        : "/login";
}

export function AccountLink({ className }: { className?: string }) {
  const { user } = useSession();
  // من لديه صلاحيات إدارية يرى حسابين: حسابه الخاص، وحساب الإدارة.
  const both = isManager(user) && user?.role !== "admin";
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
