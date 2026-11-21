import { Admin } from "@/components/forms/admin";

/** قسم من أقسام الإدارة: /admin/orders، /admin/approvals… (القائمة في src/lib/admin-nav.ts). */
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  return <Admin section={(await params).section} />;
}
