import { ContractPage } from "@/components/forms/subscriptions";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ContractPage id={(await params).id} />;
}
