import { redirect } from "next/navigation";

export default async function LegacyTypedLocationPage({ params }: { params: Promise<{ type: string; locationId: string }> }) {
  const { locationId } = await params;
  redirect(`/admin/dashboard/locations/id/${locationId}`);
}
