import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import GooglePlacesBudgetClient from "./GooglePlacesBudgetClient";
import { getGooglePlacesBudgetConfig } from "@/lib/google/google-places-budget";
import {
  locationIntelligenceApiConfigured,
  readGoogleBudgetSummaryViaLocationIntelligenceApi,
} from "@/lib/aws/location-intelligence-api";
import { getGoogleCostControlAdminSnapshot } from "@/lib/google/google-places-cost-control-admin";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export default async function GooglePlacesSettingsPage() {
  await requireAdminRole(["superadmin", "admin"]);
  const settings = await getGooglePlacesBudgetConfig();
  let summary = null;
  if (locationIntelligenceApiConfigured()) {
    try {
      summary = await readGoogleBudgetSummaryViaLocationIntelligenceApi();
    } catch {}
  }

  const controls = await getGoogleCostControlAdminSnapshot().catch(() => null);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Settings · Location Intelligence"
        title="Google Places Budget"
        subtitle="Control monthly Google spend and monitor location enrichment, five-image profile media, and address autocomplete from one place."
        badge={<AdminStatusBadge tone={summary ? "green" : "amber"}>{summary ? "Budget telemetry connected" : "Budget telemetry fallback"}</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/settings">Settings</AdminActionButton>}
      />
        <GooglePlacesBudgetClient initialSettings={settings} initialSummary={summary} initialControls={controls} />
    </AdminPageShell>
  );
}
