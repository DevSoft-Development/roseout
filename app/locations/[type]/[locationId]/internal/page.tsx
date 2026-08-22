import { notFound } from "next/navigation";
import LocationDetailPage from "../page";
import { getInternalDemoViewer } from "@/lib/demo/internal-demo-access";
import { MIRROR_DEMO_KEY } from "@/lib/demo/demo-center";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function InternalDemoLocationPage({
  params,
}: {
  params: Promise<{ type: string; locationId: string }>;
}) {
  const { locationId } = await params;
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

  const demoParams = new URLSearchParams({
    demo: "1",
    fromDemoCenter: "1",
    adminLocationId: String(location.id),
    locationId: String(location.id),
  });

  return (
    <>
      <meta name="robots" content="noindex,nofollow,noarchive" />
      <script
        dangerouslySetInnerHTML={{
          __html: `history.replaceState(null, '', location.pathname + '?' + ${JSON.stringify(
            demoParams.toString(),
          )});`,
        }}
      />
      <LocationDetailPage />
    </>
  );
}
