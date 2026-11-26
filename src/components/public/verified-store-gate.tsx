"use client";
import { usePathname } from "next/navigation";

/**
 * «متجر موثّق» للزوار في الصفحات العامة فقط. في صفحات الحساب والإدارة (الخرائط والنماذج) الشارة
 * الثابتة تغطي ما تحتها، فلا تظهر.
 */
const PRIVATE =
  /^\/(admin|dashboard|me|messages|courier|couriers|directory|requests|orders|contracts|my-subscriptions|alerts|register|login|account)(\/|$)/;

export function VerifiedStoreGate({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "/";
  return PRIVATE.test(path) ? null : children;
}
