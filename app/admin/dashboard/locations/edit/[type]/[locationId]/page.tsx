import { redirect } from "next/navigation";

export default async function LegacyLocationEdit({
  params,
}: {
  params: Promise<{ type: string; locationId: string }>;
}) {
  const { locationId } = await params;
  redirect(`/admin/dashboard/crm/${locationId}?tab=profile`);
}
