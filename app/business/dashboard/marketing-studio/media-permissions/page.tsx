import Link from "next/link";
import LocationMediaPermissions from "@/components/marketing/LocationMediaPermissions";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function publicImageUrls(location: Record<string, any>) {
  const values: unknown[] = [location.main_image, location.image_url];
  if (Array.isArray(location.images)) values.push(...location.images);
  else if (typeof location.images === "string") values.push(...location.images.split(","));
  return [...new Set(values.map((value) => typeof value === "string" ? value.trim() : "").filter((value) => /^https?:\/\//i.test(value)))];
}

export default async function MarketingMediaPermissionsPage() {
  const location = await getCurrentBusinessLocation();
  if (!location?.id) {
    return <main className="min-h-screen bg-[#050607] px-6 py-24 text-white"><div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-white/[0.04] p-6"><h1 className="text-2xl font-black">No claimed location found</h1><p className="mt-2 text-white/60">Connect a claimed location before managing Marketing media permissions.</p></div></main>;
  }

  const urls = publicImageUrls(location as Record<string, any>);
  const { data: permissionRows } = await supabaseAdmin
    .from("marketing_assets")
    .select("id,storage_path,rights_status,allow_theouthaven_feature")
    .eq("scope", "location")
    .eq("location_id", location.id)
    .in("storage_path", urls.length ? urls : ["__none__"]);
  const byUrl = new Map((permissionRows || []).map((row) => [row.storage_path, row]));
  const initialAssets = urls.map((url) => {
    const permission = byUrl.get(url);
    return {
      id: permission?.id || null,
      url,
      allowed: Boolean(permission?.allow_theouthaven_feature),
      rightsStatus: permission?.rights_status || null,
    };
  });

  return (
    <main className="min-h-screen bg-[#050607] px-4 pb-12 pt-24 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.24em] text-[#ff6b86]">Marketing Studio · Media</p><h1 className="mt-2 text-3xl font-black">{getLocationName(location, "Your location")}</h1><p className="mt-2 text-sm text-white/55">Control which profile media can be surfaced to TheOutHaven&apos;s internal Content Opportunities workflow.</p></div>
          <Link href="/business/dashboard/marketing-studio" className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-black">Back to Marketing Studio</Link>
        </div>
        <LocationMediaPermissions locationId={location.id} initialAssets={initialAssets} />
      </div>
    </main>
  );
}
