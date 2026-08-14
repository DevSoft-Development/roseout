import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { getInternalDemoViewer } from "@/lib/demo/internal-demo-access";
import { MIRROR_DEMO_KEY } from "@/lib/demo/demo-center";

type AuthorizedWebsiteLocation = Record<string, unknown>;

export async function getAuthorizedWebsiteLocation(
  user: { id: string; email?: string | null },
  locationId: string,
  select = "*",
): Promise<AuthorizedWebsiteLocation | null> {
  const { data: owned } = await supabaseAdmin
    .from("locations")
    .select(select)
    .eq("id", locationId)
    .or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email || ""},claimed_by_email.eq.${user.email || ""}`)
    .maybeSingle();

  if (owned) return owned as unknown as AuthorizedWebsiteLocation;

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

  const normalizedDemoLocation = demoLocation as unknown as AuthorizedWebsiteLocation | null;
  if (!normalizedDemoLocation || normalizedDemoLocation.is_searchable === true) return null;
  return normalizedDemoLocation;
}
