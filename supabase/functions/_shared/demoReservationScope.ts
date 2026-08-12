export const MIRROR_DEMO_KEY = "real_location_mirror_demo";

export async function resolveDemoReservationScope(
  supabase: any,
  body: Record<string, unknown>,
): Promise<string | null> {
  const rawLocationId = body?.demoLocationId;
  if (rawLocationId == null || String(rawLocationId).trim() === "") return null;

  if (body?.demoOnly !== true) {
    throw new Error("FORBIDDEN: demoLocationId requires demoOnly=true");
  }

  const locationId = String(rawLocationId).trim();
  const { data, error } = await supabase
    .from("locations")
    .select("id,demo_key,is_demo,is_searchable,is_hidden")
    .eq("id", locationId)
    .maybeSingle();

  if (error || !data?.id) {
    throw new Error("FORBIDDEN: demo location was not found");
  }

  if (
    data.demo_key !== MIRROR_DEMO_KEY ||
    data.is_demo !== true ||
    data.is_searchable === true ||
    data.is_hidden !== true
  ) {
    throw new Error("FORBIDDEN: requested location is not the hidden mirror demo");
  }

  return locationId;
}
