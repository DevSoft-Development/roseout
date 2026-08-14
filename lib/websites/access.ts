import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { getInternalDemoViewer } from "@/lib/demo/internal-demo-access";
import { MIRROR_DEMO_KEY } from "@/lib/demo/demo-center";

export async function getAuthorizedWebsiteLocation(
  user: { id: string; email?: string | null },
  locationId: string,
  select = "*",
) {
  const { data: owned } = await supabaseAdmin
    .from("locations")
    .select(select)
    .eq("id", locationId)
    .or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email || ""},claimed_by_email.eq.${user.email || ""}`)
    .maybeSingle();

  if (owned) return owned;

  const internalViewer = await getInternalDemoViewer().catch(() => null);
  if (!internalViewer) return null;

  const { data: demoLocation } = await supabaseAdmin
    .from("locations")
    .select(select)
    .eq("id", locationId)
    .eq("demo_key", MIRROR_DEMO_KEY)
    .eq("is_demo", true)
    .eq("is_hidden", true)
    .maybeSingle();

  if (!demoLocation || demoLocation.is_searchable === true) return null;
  return demoLocation;
}
