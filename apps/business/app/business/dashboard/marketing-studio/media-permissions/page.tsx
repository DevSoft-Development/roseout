import LocationMediaPermissions from "@/components/marketing/LocationMediaPermissions";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { BusinessActionButton, BusinessPageHeader, BusinessPageShell, BusinessStatusBadge } from "@/components/business/BusinessDesignSystem";

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
    return <BusinessPageShell><BusinessPageHeader eyebrow="Marketing Studio · Media" title="No claimed location found" subtitle="Connect a claimed location before managing Marketing media permissions." badge={<BusinessStatusBadge tone="amber">Location required</BusinessStatusBadge>} /></BusinessPageShell>;
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
    <BusinessPageShell>
      <BusinessPageHeader
        eyebrow="Marketing Studio · Media"
        title={getLocationName(location, "Your location")}
        subtitle="Control which profile media can be surfaced to TheOutHaven's internal Content Opportunities workflow."
        badge={<BusinessStatusBadge tone="blue">{initialAssets.length} media assets</BusinessStatusBadge>}
        actions={<BusinessActionButton href="/business/dashboard/marketing-studio">Marketing Studio</BusinessActionButton>}
      />
      <LocationMediaPermissions locationId={location.id} initialAssets={initialAssets} />
    </BusinessPageShell>
  );
}
