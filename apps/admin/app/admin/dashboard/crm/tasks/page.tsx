import { redirect } from "next/navigation";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { CRM_READ_ROLES } from "@/lib/crm/permissions";

export const dynamic = "force-dynamic";

export default async function RedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdminRole(CRM_READ_ROLES);
  const params = await searchParams;
  const selectedLocation = params.location_id || params.location;
  const next = new URLSearchParams();

  if (selectedLocation) next.set("location", selectedLocation);
  if (params.return_to) next.set("return_to", params.return_to);
  if (params.view) next.set("view", params.view);
  if (params.search) next.set("search", params.search);
  if (params.priority) next.set("priority", params.priority);
  if (params.status) next.set("status", params.status);

  if (params.create === "task") {
    const create = new URLSearchParams();
    if (selectedLocation) create.set("location_id", selectedLocation);
    if (params.return_to) create.set("return_to", params.return_to);
    redirect(`/admin/dashboard/crm/work-queue/new${create.size ? `?${create.toString()}` : ""}`);
  }

  redirect(`/admin/dashboard/crm/my-work${next.size ? `?${next.toString()}` : ""}`);
}
