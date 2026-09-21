import type { Metadata } from "next";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import PromotionsAdminClient from "./PromotionsAdminClient";
import {
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Sponsored Promotions | TheOutHaven Admin" },
  description: "Monitor and govern sponsored Discover and Search campaigns.",
};

export default async function PromotionsAdminPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Marketing · Sponsored Promotions"
        title="Promotion Command Center"
        subtitle="Monitor self-service campaigns created from Location Dashboard, review delivery and ROI, and pause or resume campaigns without manually merchandising individual cards."
        badge={<AdminStatusBadge tone="green">Search relevance protected</AdminStatusBadge>}
      />
      <div className="flex flex-wrap gap-2">
        <AdminStatusBadge tone="blue">Discover CPM</AdminStatusBadge>
        <AdminStatusBadge tone="blue">Search CPC</AdminStatusBadge>
      </div>
      <PromotionsAdminClient />
    </AdminPageShell>
  );
}
