import { requireAdminApiRole } from "@/lib/admin-api-auth";
import {
  getStampsStatusViaIntegrationApi,
  platformIntegrationApiConfigured,
  testStampsConnectionViaIntegrationApi,
} from "@/lib/aws/integration-api";
import { getStampsConfiguration, testStampsConnection } from "@/lib/stamps-postcard";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["superadmin", "admin", "manager"] as const;

function productionMustUseAwsIntegrationApi() {
  return process.env.VERCEL_ENV === "production";
}

export async function POST() {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;

  try {
    const useAwsIntegrationApi = productionMustUseAwsIntegrationApi();

    if (!useAwsIntegrationApi) {
      const local = getStampsConfiguration();
      if (local.mode === "staging") {
        const result = await testStampsConnection();
        return Response.json({
          success: result.ok,
          connection: result,
          integration: {
            mode: local.mode,
            configured: local.configured,
            postcardEnabled: local.postcardEnabled,
            livePurchasesEnabled: local.livePurchasesEnabled,
            runtime: "vercel-staging",
          },
        }, { status: result.ok ? 200 : 409 });
      }
    }

    if (!platformIntegrationApiConfigured()) {
      return Response.json({ success: false, error: "The AWS Integration API is not configured for production Stamps.com traffic." }, { status: 503 });
    }

    const status = await getStampsStatusViaIntegrationApi();
    if (!status.configured || !status.endpointApproved) {
      return Response.json({
        success: false,
        error: "Save the Stamps.com Production Integration ID, username, and password in the Superadmin Credentials Vault first.",
        integration: { ...status, runtime: "aws-integration-api" },
      }, { status: 409 });
    }

    const result = await testStampsConnectionViaIntegrationApi();
    return Response.json({
      success: result.ok,
      connection: result,
      integration: { ...status, runtime: "aws-integration-api" },
    }, { status: result.ok ? 200 : 409 });
  } catch (error) {
    console.error("AWS Stamps.com connection test failed", {
      message: error instanceof Error ? error.message : "Unknown Stamps.com connection error.",
    });
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Could not connect to Stamps.com through AWS.",
    }, { status: 502 });
  }
}
