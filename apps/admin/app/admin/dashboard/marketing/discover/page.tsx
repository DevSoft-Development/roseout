import type { Metadata } from "next";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import DiscoverMerchandisingClient from "./DiscoverMerchandisingClient";

import {
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Discover Merchandising | TheOutHaven Admin" },
  description: "Manage curated and sponsored content for the Discover experience.",
};

export default async function DiscoverMerchandisingPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);

  return (
    <AdminPageShell>
        <AdminPageHeader
          eyebrow="Marketing · Discover"
          title="Discover Merchandising"
          subtitle="Curate complete outings and partner placements while trending, popular searches, areas, and most-saved content refresh from real TheOutHaven activity."
          badge={<AdminStatusBadge tone="green">Daily auto refresh</AdminStatusBadge>}
        />

        <DiscoverMerchandisingClient />
    </AdminPageShell>
  );
}
