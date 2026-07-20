import { redirect } from "next/navigation";
import { getLocationWorkspaceHref } from "@/lib/admin/location-workspace";

export default async function LocationWorkspaceEntry({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(getLocationWorkspaceHref(id, "overview"));
}
