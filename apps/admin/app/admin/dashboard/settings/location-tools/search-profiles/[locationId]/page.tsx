import { SearchProfileReviewForm } from "@/components/admin/location-tools/SearchProfileReviewForm";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminActionButton, AdminPageHeader, AdminPageShell, AdminStatusBadge } from "@/lib/admin-design-system";

export const dynamic = "force-dynamic";

function list(value: unknown): string {
  return Array.isArray(value) && value.length ? value.join(", ") : "—";
}

export default async function SearchProfileReviewPage({ params }: { params: Promise<{ locationId: string }> }) {
  await requireAdminRole(["superadmin", "admin"]);
  const adminDb = getAdminDatabaseClient();
  const { locationId } = await params;
  const [locationResult, profileResult] = await Promise.all([
    adminDb
      .from("locations")
      .select("id,name,restaurant_name,activity_name,location_type,address,city,state")
      .eq("id", locationId)
      .maybeSingle(),
    adminDb
      .from("location_search_profiles")
      .select("*")
      .eq("location_id", locationId)
      .maybeSingle(),
  ]);
  if (locationResult.error) throw new Error(locationResult.error.message);
  if (profileResult.error) throw new Error(profileResult.error.message);
  if (!locationResult.data || !profileResult.data) notFound();

  const location = locationResult.data;
  const profile = profileResult.data;
  const name = location.name ?? location.restaurant_name ?? location.activity_name ?? "Unnamed location";

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Settings · Search Profiles"
        title="Review search profile"
        subtitle={`${name} · ${location.location_type ?? "Unknown type"} · ${[location.address, location.city, location.state].filter(Boolean).join(", ")}`}
        badge={<AdminStatusBadge tone={profile.needs_review ? "amber" : profile.verified_at ? "green" : "blue"}>{profile.needs_review ? "Needs review" : profile.verified_at ? "Verified" : "Generated"}</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/settings/location-tools/search-profiles">Search Profiles</AdminActionButton>}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <Card label="Status" value={profile.needs_review ? "Needs review" : profile.verified_at ? "Verified" : "Generated"} />
        <Card label="Confidence" value={`${Math.round(Number(profile.confidence ?? 0) * 100)}%`} />
        <Card label="Profile version" value={String(profile.profile_version ?? "—")} />
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
        <h2 className="text-lg font-black">Why it needs review</h2>
        <p className="mt-2 text-sm text-amber-100/80">{list(profile.review_reasons)}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <ProfileField label="Primary domain" value={profile.primary_domain ?? "—"} />
        <ProfileField label="Supported domains" value={list(profile.supported_domains)} />
        <ProfileField label="Restaurant categories" value={list(profile.restaurant_categories)} />
        <ProfileField label="Activity categories" value={list(profile.activity_categories)} />
        <ProfileField label="Nightlife categories" value={list(profile.nightlife_categories)} />
        <ProfileField label="Cuisines" value={list(profile.cuisines)} />
        <ProfileField label="Foods" value={list(profile.foods)} />
        <ProfileField label="Features" value={list(profile.features)} />
        <ProfileField label="Canonical terms" value={list(profile.canonical_terms)} />
        <ProfileField label="Current manual overrides" value={JSON.stringify(profile.manual_overrides ?? {}, null, 2)} pre />
      </section>

      <section>
        <h2 className="mb-3 text-xl font-black">Apply corrections</h2>
        <p className="mb-4 text-sm text-white/55">Set the correct domain and add or remove canonical terms and features. Applying rebuilds the profile with manual overrides, records the reviewer, and clears the review flag.</p>
        <SearchProfileReviewForm locationId={locationId} primaryDomain={profile.primary_domain ?? "activity"} />
      </section>
    </AdminPageShell>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-xs font-black uppercase tracking-wide text-white/40">{label}</p><p className="mt-2 text-xl font-black">{value}</p></div>;
}

function ProfileField({ label, value, pre = false }: { label: string; value: string; pre?: boolean }) {
  return <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-xs font-black uppercase tracking-wide text-white/40">{label}</p>{pre ? <pre className="mt-2 whitespace-pre-wrap text-xs text-white/70">{value}</pre> : <p className="mt-2 text-sm text-white/75">{value}</p>}</div>;
}
