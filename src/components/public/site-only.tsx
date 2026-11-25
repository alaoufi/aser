"use client";
import { usePathname } from "next/navigation";

/**
 * ما يخص الموقع وحده (الترويسة، والتذييل، وتنبيهات الحساب الشخصي): لا يظهر داخل «لوحة الإدارة»،
 * فاللوحة منفصلة تمامًا بإطارها وجلستها (قرار المالك 2026-11-21).
 */
export function SiteOnly({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? "";
  if (path === "/admin" || path.startsWith("/admin/")) return null;
  // شاشة تحديث التطبيق القديم: بلا ترويسة ولا تذييل ولا روابط، فلا يواصل إلا بالتحديث.
  if (path === "/update-app") return null;
  return children;
}
