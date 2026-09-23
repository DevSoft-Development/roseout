import { ExternalLink, SearchCheck, ShieldCheck } from "lucide-react";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { googleBusinessConfigured } from "@/lib/google/google-business-profile";
import { WebsiteHealthPanel } from "@/components/websites/WebsiteHealthPanel";
import GoogleBusinessProfileCard from "../social-accounts/GoogleBusinessProfileCard";
import {
  BusinessPageHeader,
  BusinessPageShell,
  BusinessStatusBadge,
} from "@/components/business/BusinessDesignSystem";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function visibilityTone(score: number | null, mismatchCount: number) {
  if (score != null && score >= 85 && mismatchCount === 0) return "green" as const;
  if (score != null && score >= 60) return "amber" as const;
  return "red" as const;
}

export default async function VisibilityHealthPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const requestedLocationId =
    first(params.locationId) ||
    first(params.adminLocationId) ||
    first(params.demoLocationId) ||
    undefined;
  const location = await getCurrentBusinessLocation(requestedLocationId);

  if (!location?.id) {
    return (
      <BusinessPageShell>
        <BusinessPageHeader
          eyebrow="Visibility Health"
          title="No connected location found"
          subtitle="Connect or claim a location before checking search and Google visibility."
          badge={<BusinessStatusBadge tone="amber">Location required</BusinessStatusBadge>}
        />
      </BusinessPageShell>
    );
  }

  const locationId = String(location.id);
  const { data: googleBusinessConnection } = await supabaseAdmin
    .from("google_business_profile_connections")
    .select(
      "id,google_account_display_name,google_location_name,google_location_title,status,token_expires_at,connected_at,last_sync_at,last_error,health_score,mismatch_count,mismatches,candidate_locations",
    )
    .eq("location_id", locationId)
    .neq("status", "disconnected")
    .maybeSingle();

  const googleScore = googleBusinessConnection
    ? Number(googleBusinessConnection.health_score || 0)
    : null;
  const mismatchCount = Number(googleBusinessConnection?.mismatch_count || 0);
  const tone = visibilityTone(googleScore, mismatchCount);
  const locationName = getLocationName(location, "This location");

  return (
    <BusinessPageShell>
      <BusinessPageHeader
        eyebrow="Local Search · Visibility"
        title="Visibility Health"
        subtitle="One workspace for website SEO readiness, Google Business Profile alignment, and safe repair actions."
        badge={
          <BusinessStatusBadge tone={tone}>
            {googleScore == null
              ? "Connect Google"
              : mismatchCount
                ? `${mismatchCount} Google difference${mismatchCount === 1 ? "" : "s"}`
                : `Google health ${googleScore}%`}
          </BusinessStatusBadge>
        }
      />

      <section className="mb-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-5">
          <div className="flex items-center gap-3">
            <SearchCheck className="h-5 w-5 text-blue-200" />
            <p className="text-sm font-black text-[var(--business-text)]">Search readiness</p>
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--business-muted)]">
            Checks live reachability, sitemap, robots, title/meta signals, structured data, content, menu, reviews, and booking paths.
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-5">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-200" />
            <p className="text-sm font-black text-[var(--business-text)]">Owner-controlled repairs</p>
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--business-muted)]">
            Google differences are never overwritten silently. Business name, phone, website, address, and hours require an explicit source-of-truth choice.
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-5">
          <div className="flex items-center gap-3">
            <ExternalLink className="h-5 w-5 text-violet-200" />
            <p className="text-sm font-black text-[var(--business-text)]">One location scope</p>
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--business-muted)]">
            Health and repair actions are scoped to {locationName}; no cross-location Google credentials or website state are reused.
          </p>
        </div>
      </section>

      <WebsiteHealthPanel locationId={locationId} />

      <GoogleBusinessProfileCard
        locationId={locationId}
        locationName={locationName}
        configured={googleBusinessConfigured()}
        connection={(googleBusinessConnection as any) || null}
      />
    </BusinessPageShell>
  );
}
