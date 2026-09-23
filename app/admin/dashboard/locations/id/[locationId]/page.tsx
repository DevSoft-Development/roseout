import { redirect } from "next/navigation";

export default async function LegacyLocationDetail({
  params,
}: {
  params: Promise<{ locationId: string }>;
}) {
  const { locationId } = await params;
  redirect(`/admin/dashboard/crm/${locationId}`);
}
