import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationName } from "@/lib/locationName";
import { getLocationScore } from "@/lib/locationScore";
import { supabase } from "@/lib/supabase";

type LocationType = "restaurants" | "activities";

type LocationRecord = Record<string, unknown> & {
  id: string;
  locationType: LocationType;
  source_table?: string | null;
  location_type?: string | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  claim_code?: string | null;
  claim_status?: string | null;
  owner_user_id?: string | null;
};

async function findLocation(id: string): Promise<LocationRecord | null> {
  const normalizedId = id.trim();
  if (!normalizedId) return null;

  const { data: locationData } = await supabase
    .from("locations")
    .select("*")
    .eq("id", normalizedId)
    .maybeSingle();
  if (locationData) {
    const sourceTable = String(locationData.source_table || "").toLowerCase();
    const locationType = String(locationData.location_type || "").toLowerCase();
    const normalizedType: LocationType =
      sourceTable === "activities" || locationType === "activity" || locationType === "activities"
        ? "activities"
        : "restaurants";

    return { ...locationData, locationType: normalizedType, id: normalizedId };
  }

  const restaurantResult = await supabase.from("restaurants").select("*").eq("id", normalizedId).maybeSingle();
  if (restaurantResult.data) {
    return { ...restaurantResult.data, locationType: "restaurants", id: normalizedId };
  }

  const activityResult = await supabase.from("activities").select("*").eq("id", normalizedId).maybeSingle();
  if (activityResult.data) {
    return { ...activityResult.data, locationType: "activities", id: normalizedId };
  }

  return null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-black/10 bg-white p-5">
      <h2 className="text-lg font-black text-[#1b1210]">{title}</h2>
      <div className="mt-3 text-sm text-black/70">{children}</div>
    </section>
  );
}

export default async function AdminLocationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);
  const { id } = await params;
  const location = await findLocation(id);

  if (!location) notFound();

  const name = getLocationName(location, "Untitled location");
  const image = getLocationImage(location);
  const score = getLocationScore(location);
  const publicUrl = `/locations/${location.locationType}/${location.id}`;

  return (
    <main className="min-h-screen bg-[#f8f3ef] p-6 text-[#1b1210]">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-3xl border border-black/10 bg-white p-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-black/45">Admin CRM Location</p>
          <h1 className="mt-2 text-3xl font-black">{name}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-black/60">
            <span className="rounded-full bg-[#f5eee8] px-3 py-1">Type: {location.locationType}</span>
            <span className="rounded-full bg-[#f5eee8] px-3 py-1">ID: {location.id}</span>
            <span className="rounded-full bg-[#f5eee8] px-3 py-1">Opportunity score: {score}</span>
          </div>
        </header>

        <Section title="Public Preview">
          {image ? <img src={image} alt={name} className="mb-3 h-48 w-full rounded-2xl object-cover" /> : null}
          <p>Public listing preview: {name}</p>
          <Link className="mt-2 inline-block text-rose-700 underline" href={publicUrl}>Open public page</Link>
        </Section>

        {[
          "Overview","CRM Metrics","Analytics","Upsell Opportunities","Reservation Links","Claim Access","Owner Info","Communication","Support Tickets","Notes / History","Data Quality","Semantic Tags","Layout / Reservations","Promotions",
        ].map((title) => (
          <Section key={title} title={title}>
            {title === "Claim Access" ? (
              <>
                <p>Claim code: {String(location.claim_code || "Not set")}</p>
                <p className="mt-1">QR code URL: /api/claim/qr?locationId={location.id}</p>
              </>
            ) : (
              <p>CRM workspace section for {title.toLowerCase()}.</p>
            )}
          </Section>
        ))}
      </div>
    </main>
  );
}
