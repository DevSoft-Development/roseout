import Link from "next/link";
import GooglePlacesBudgetClient from "./GooglePlacesBudgetClient";
import { getGooglePlacesBudgetConfig } from "@/lib/google/google-places-budget";
import {
  locationIntelligenceApiConfigured,
  readGoogleBudgetSummaryViaLocationIntelligenceApi,
} from "@/lib/aws/location-intelligence-api";
import { getGoogleCostControlAdminSnapshot } from "@/lib/google/google-places-cost-control";

export const dynamic = "force-dynamic";

export default async function GooglePlacesSettingsPage() {
  const settings = await getGooglePlacesBudgetConfig();
  let summary = null;
  if (locationIntelligenceApiConfigured()) {
    try {
      summary = await readGoogleBudgetSummaryViaLocationIntelligenceApi();
    } catch {}
  }

  const controls = await getGoogleCostControlAdminSnapshot().catch(() => null);

  return (
    <main className="admin-page min-h-screen bg-[#090706] px-4 pb-12 pt-24 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">Settings · Location Intelligence</p>
            <h1 className="mt-2 text-3xl font-black">Google Places Budget</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
              Control monthly Google spend and monitor location enrichment, five-image profile media, and address autocomplete from one place.
            </p>
          </div>
          <Link href="/admin/dashboard/settings" className="text-sm font-black text-rose-300 hover:text-rose-200">
            Back to Settings
          </Link>
        </div>
        <GooglePlacesBudgetClient initialSettings={settings} initialSummary={summary} initialControls={controls} />
      </div>
    </main>
  );
}
