import type { Metadata } from "next";
import { AdminFrame } from "@/components/admin/admin-frame";

export const metadata: Metadata = {
  title: "لوحة الإدارة",
  robots: { index: false, follow: false },
};

/** «لوحة الإدارة»: إطارها الخاص (قائمة جانبية) بلا ترويسة الموقع وتذييله، وجلستها المستقلة. */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminFrame>{children}</AdminFrame>;
}
