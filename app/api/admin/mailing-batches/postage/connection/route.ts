import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getStampsConfiguration, testStampsConnection } from "@/lib/stamps-postcard";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["superadmin", "admin", "manager"] as const;

export async function POST() {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;

  try {
    const config = getStampsConfiguration();
    const result = await testStampsConnection();

    return Response.json({
      success: result.ok,
      connection: result,
      integration: {
        mode: config.mode,
        configured: config.configured,
        postcardEnabled: config.postcardEnabled,
        livePurchasesEnabled: config.livePurchasesEnabled,
      },
    }, { status: result.ok ? 200 : 409 });
  } catch (error) {
    console.error("Stamps.com connection test failed", error);
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Could not connect to Stamps.com staging.",
    }, { status: 502 });
  }
}
