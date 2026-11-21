import { ContractPage } from "@/components/forms/subscriptions";

/** عقد اشتراك تفتحه الإدارة من «عقود الاشتراكات»، داخل اللوحة وبجلستها. */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ContractPage id={(await params).id} />;
}
