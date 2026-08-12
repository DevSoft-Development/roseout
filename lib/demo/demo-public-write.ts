import { getInternalDemoViewer } from "@/lib/demo/internal-demo-access";
import { MIRROR_DEMO_KEY } from "@/lib/demo/demo-center";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const DEMO_CUSTOMER_EMAIL = "demo-customer@theouthaven.com";
export const DEMO_VIP_EMAIL = "demo-vip@theouthaven.com";

export type DemoPublicWriteContext = {
  isDemo: boolean;
  viewer: Awaited<ReturnType<typeof getInternalDemoViewer>> | null;
};

export async function requireSafeDemoPublicWrite(
  locationId: string,
): Promise<DemoPublicWriteContext> {
  const { data: location, error } = await supabaseAdmin
    .from("locations")
    .select("id,demo_key,is_demo,is_hidden,is_searchable")
    .eq("id", locationId)
    .maybeSingle();

  if (error || !location?.id) {
    return { isDemo: false, viewer: null };
  }

  const isDemo =
    location.demo_key === MIRROR_DEMO_KEY || location.is_demo === true;
  if (!isDemo) return { isDemo: false, viewer: null };

  if (
    location.demo_key !== MIRROR_DEMO_KEY ||
    location.is_demo !== true ||
    location.is_hidden !== true ||
    location.is_searchable === true
  ) {
    throw new Error("DEMO_WRITE_BLOCKED: fixture safety contract failed");
  }

  const viewer = await getInternalDemoViewer();
  if (!viewer) {
    throw new Error("DEMO_WRITE_FORBIDDEN");
  }

  return { isDemo: true, viewer };
}
