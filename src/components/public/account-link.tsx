"use client";
import Link from "next/link";
import { useSession } from "@/components/forms/shared";

export function AccountLink({ className }: { className?: string }) {
  const { user } = useSession();
  const href =
    user?.role === "admin" || user?.role === "staff"
      ? "/admin"
      : user?.role === "producer"
        ? "/dashboard"
        : user
          ? "/orders"
          : "/login";
  return (
    <Link href={href} className={className}>
      {user ? "حسابي" : "تسجيل الدخول"}
    </Link>
  );
}
