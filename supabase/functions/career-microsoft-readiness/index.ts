import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getMicrosoftAppReadinessViaIntegrationApi } from "../_shared/aws-integration.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUSINESS_PREMIUM_SKU_ID = "cbdc14ab-d96c-4c30-b9f4-6ada7cdc1d46";
const REQUIRED_GRAPH_ROLES = [
  "LicenseAssignment.ReadWrite.All",
  "User.Create",
  "User.EnableDisableAccount.All",
  "User.Read.All",
  "UserAuthMethod-TAP.ReadWrite.All",
] as const;

type ReadinessCheck = { key: string; label: string; ok: boolean; detail: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAdmin(req: Request, supabaseUrl: string, anonKey: string, serviceRoleKey: string) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return { ok: false as const, status: 401, error: "Unauthorized" };
  const token = auth.slice(7);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return { ok: false as const, status: 401, error: "Unauthorized" };
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: adminUser } = await admin.from("admin_users").select("user_id,role").eq("user_id", userData.user.id).maybeSingle();
  if (!adminUser || !["superadmin", "admin"].includes(adminUser.role)) return { ok: false as const, status: 403, error: "Forbidden" };
  return { ok: true as const, userId: userData.user.id };
}

async function runReadinessCheck() {
  const result = await getMicrosoftAppReadinessViaIntegrationApi();
  const roles = Array.isArray(result.roles) ? result.roles.filter((role): role is string => typeof role === "string") : [];
  const licenseSku = typeof result.licenseSku === "string" ? result.licenseSku : "";
  const missingRoles = REQUIRED_GRAPH_ROLES.filter((role) => !roles.includes(role));
  const checks: ReadinessCheck[] = [
    {
      key: "provider-boundary",
      label: "AWS Integration API",
      ok: result.provider === "microsoft-graph",
      detail: "Microsoft credentials and app-only tokens are owned by the AWS Integration API.",
    },
    {
      key: "tenant",
      label: "Microsoft tenant",
      ok: result.tenantMatches === true,
      detail: result.tenantMatches === true ? "The app-only token is issued for the configured Microsoft tenant." : "The Microsoft tenant did not match the AWS credential authority.",
    },
    {
      key: "graph-users",
      label: "Microsoft Graph user access",
      ok: result.graphUserRead === true,
      detail: result.graphUserRead === true ? "AWS successfully performed a non-destructive Microsoft Graph user read." : "The AWS Microsoft Graph user read failed.",
    },
    {
      key: "graph-permissions",
      label: "Microsoft Graph application permissions",
      ok: missingRoles.length === 0,
      detail: missingRoles.length === 0 ? "All required Microsoft Graph application permissions are present." : `Missing token roles: ${missingRoles.join(", ")}.`,
    },
    {
      key: "license-sku",
      label: "Business Premium license SKU",
      ok: licenseSku.toLowerCase() === BUSINESS_PREMIUM_SKU_ID,
      detail: licenseSku.toLowerCase() === BUSINESS_PREMIUM_SKU_ID ? "Configured for Microsoft 365 Business Premium." : "The AWS credential authority is missing the expected Business Premium license SKU.",
    },
  ];
  return {
    success: true,
    ready: Boolean(result.ok) && checks.every((check) => check.ok),
    checkedAt: new Date().toISOString(),
    checks,
    requiredPermissions: REQUIRED_GRAPH_ROLES,
    configuredLicenseSku: licenseSku || null,
    runtime: {
      deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID") || null,
      region: Deno.env.get("SB_REGION") || null,
      provider: "aws_integration_api",
    },
    note: "No Microsoft account, mailbox, password, Temporary Access Pass, or license was created or changed by this test. Microsoft provider secrets never enter the Edge runtime.",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ success: false, error: "Supabase is not configured." }, 500);
  const admin = await requireAdmin(req, supabaseUrl, anonKey, serviceRoleKey);
  if (!admin.ok) return json({ success: false, error: admin.error }, admin.status);
  try {
    return json(await runReadinessCheck());
  } catch (error) {
    console.error("career-microsoft-readiness failed", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Microsoft readiness check failed." }, 500);
  }
});
