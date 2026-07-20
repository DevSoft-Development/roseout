import { redirect } from "next/navigation";
import {
  getLegacyCrmHref,
  normalizeLocationWorkspaceTab,
} from "@/lib/admin/location-workspace";

export default async function LocationWorkspaceAdapter({
  params,
}: {
  params: Promise<{ id: string; workspace: string }>;
}) {
  const { id, workspace } = await params;
  const tab = normalizeLocationWorkspaceTab(workspace);

  // Migration adapter: the new stable workspace URLs are available immediately
  // while each legacy CRM panel is moved into its dedicated route incrementally.
  redirect(getLegacyCrmHref(id, tab));
}
