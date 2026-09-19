import { notFound, redirect } from "next/navigation";
import LocationDetailPage from "../page";
import { getInternalDemoViewer } from "@/lib/demo/internal-demo-access";
import { MIRROR_DEMO_KEY } from "@/lib/demo/demo-center";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InternalDemoLocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; locationId: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { type, locationId } = await params;
  const query = searchParams ? await searchParams : {};
  const viewer = await getInternalDemoViewer();
  if (!viewer) notFound();

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("id,demo_key,is_demo,is_hidden,is_searchable")
    .eq("id", locationId)
    .maybeSingle();

  const isSafeFixture =
    location?.id &&
    location.demo_key === MIRROR_DEMO_KEY &&
    location.is_demo === true &&
    location.is_hidden === true &&
    location.is_searchable !== true;

  if (!isSafeFixture) notFound();

  const hasDemoContext =
    first(query.demo) === "1" &&
    first(query.fromDemoCenter) === "1" &&
    first(query.adminLocationId) === String(location.id) &&
    first(query.locationId) === String(location.id);

  if (!hasDemoContext) {
    const demoParams = new URLSearchParams({
      demo: "1",
      fromDemoCenter: "1",
      adminLocationId: String(location.id),
      locationId: String(location.id),
    });
    redirect(`/locations/${encodeURIComponent(type)}/${encodeURIComponent(locationId)}/internal?${demoParams.toString()}`);
  }

  return (
    <>
      <meta name="robots" content="noindex,nofollow,noarchive" />
      <LocationDetailPage />
    </>
  );
}
