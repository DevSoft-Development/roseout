import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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

type ReadinessCheck = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function decodeJwtClaims(token: string): Record<string, unknown> {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("Microsoft returned an invalid access token.");
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function requireAdmin(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
  serviceRoleKey: string,
) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const token = auth.slice(7);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: adminUser } = await admin
    .from("admin_users")
    .select("user_id,role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!adminUser || !["superadmin", "admin"].includes(adminUser.role)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, userId: userData.user.id };
}

function presenceCheck(key: string, label: string, value: string, fallbackKey?: string): ReadinessCheck {
  return {
    key,
    label,
    ok: Boolean(value),
    detail: value
      ? `${fallbackKey ? `${label} is available to the Edge runtime.` : `${label} is present in the Edge runtime.`}`
      : `Missing from the Edge runtime. Add the secret using the exact key name ${key}.`,
  };
}

async function runReadinessCheck() {
  const tenantId = clean(Deno.env.get("M365_TENANT_ID"));
  const provisioningClientId = clean(Deno.env.get("M365_PROVISIONING_CLIENT_ID"));
  const legacyClientId = clean(Deno.env.get("M365_CLIENT_ID"));
  const clientId = provisioningClientId || legacyClientId;
  const provisioningClientSecret = clean(Deno.env.get("M365_PROVISIONING_CLIENT_SECRET"));
  const legacyClientSecret = clean(Deno.env.get("M365_CLIENT_SECRET"));
  const clientSecret = provisioningClientSecret || legacyClientSecret;
  const licenseSku = clean(Deno.env.get("M365_EMPLOYEE_LICENSE_SKU_ID"));

  const checks: ReadinessCheck[] = [
    presenceCheck("M365_TENANT_ID", "Microsoft tenant ID", tenantId),
    {
      ...presenceCheck(
        "M365_PROVISIONING_CLIENT_ID",
        "Provisioning application client ID",
        clientId,
        legacyClientId && !provisioningClientId ? "M365_CLIENT_ID" : undefined,
      ),
      detail: clientId
        ? provisioningClientId
          ? "M365_PROVISIONING_CLIENT_ID is present in the Edge runtime."
          : "Using legacy fallback M365_CLIENT_ID. Add M365_PROVISIONING_CLIENT_ID for the dedicated employee provisioning app."
        : "Missing from the Edge runtime. Add the secret using the exact key name M365_PROVISIONING_CLIENT_ID.",
    },
    {
      ...presenceCheck(
        "M365_PROVISIONING_CLIENT_SECRET",
        "Provisioning application client secret",
        clientSecret,
        legacyClientSecret && !provisioningClientSecret ? "M365_CLIENT_SECRET" : undefined,
      ),
      detail: clientSecret
        ? provisioningClientSecret
          ? "M365_PROVISIONING_CLIENT_SECRET is present in the Edge runtime. The value is never returned by this test."
          : "Using legacy fallback M365_CLIENT_SECRET. Add M365_PROVISIONING_CLIENT_SECRET for the dedicated employee provisioning app."
        : "Missing from the Edge runtime. Add the secret using the exact key name M365_PROVISIONING_CLIENT_SECRET.",
    },
    presenceCheck("M365_EMPLOYEE_LICENSE_SKU_ID", "Employee license SKU", licenseSku),
  ];

  const skuIsGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(licenseSku);
  checks.push({
    key: "license-sku",
    label: "Business Premium license SKU",
    ok: skuIsGuid && licenseSku.toLowerCase() === BUSINESS_PREMIUM_SKU_ID,
    detail: licenseSku.toLowerCase() === BUSINESS_PREMIUM_SKU_ID
      ? "Configured for Microsoft 365 Business Premium."
      : skuIsGuid
        ? "A Microsoft license SKU is configured, but it is not the expected Business Premium SKU."
        : "The employee license SKU is missing or malformed.",
  });

  if (!tenantId || !clientId || !clientSecret) {
    return {
      success: true,
      ready: false,
      checkedAt: new Date().toISOString(),
      checks,
      runtime: {
        deploymentId: clean(Deno.env.get("DENO_DEPLOYMENT_ID")) || null,
        region: clean(Deno.env.get("SB_REGION")) || null,
      },
      note: "No Microsoft account, mailbox, or license was created by this test. Secret values are never returned.",
    };
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  let accessToken = "";
  try {
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
    );

    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.json().catch(() => ({}));
      const code = clean(tokenError?.error);
      const description = clean(tokenError?.error_description).split("\r\n")[0].slice(0, 240);
      throw new Error(
        `Microsoft token request failed (${tokenResponse.status})${code ? `: ${code}` : ""}${description ? ` - ${description}` : ""}.`,
      );
    }

    const tokenPayload = await tokenResponse.json();
    accessToken = clean(tokenPayload.access_token);
    if (!accessToken) throw new Error("Microsoft did not return an access token.");

    checks.push({
      key: "token",
      label: "App-only Microsoft authentication",
      ok: true,
      detail: "Supabase successfully obtained a Microsoft Graph client-credentials token.",
    });
  } catch (error) {
    checks.push({
      key: "token",
      label: "App-only Microsoft authentication",
      ok: false,
      detail: error instanceof Error ? error.message : "Microsoft authentication failed.",
    });

    return {
      success: true,
      ready: false,
      checkedAt: new Date().toISOString(),
      checks,
      runtime: {
        deploymentId: clean(Deno.env.get("DENO_DEPLOYMENT_ID")) || null,
        region: clean(Deno.env.get("SB_REGION")) || null,
      },
      note: "No Microsoft account, mailbox, or license was created by this test. Secret values are never returned.",
    };
  }

  let roles: string[] = [];
  try {
    const claims = decodeJwtClaims(accessToken);
    roles = Array.isArray(claims.roles)
      ? claims.roles.filter((role): role is string => typeof role === "string")
      : [];

    const tenantMatches = typeof claims.tid !== "string" || claims.tid.toLowerCase() === tenantId.toLowerCase();
    checks.push({
      key: "tenant",
      label: "Microsoft tenant",
      ok: tenantMatches,
      detail: tenantMatches
        ? "The access token is issued for the configured Microsoft tenant."
        : "The token tenant does not match M365_TENANT_ID.",
    });
  } catch (error) {
    checks.push({
      key: "tenant",
      label: "Microsoft tenant",
      ok: false,
      detail: error instanceof Error ? error.message : "Could not inspect Microsoft token claims.",
    });
  }

  const missingRoles = REQUIRED_GRAPH_ROLES.filter((role) => !roles.includes(role));
  checks.push({
    key: "graph-permissions",
    label: "Microsoft Graph application permissions",
    ok: missingRoles.length === 0,
    detail: missingRoles.length === 0
      ? "All required application permissions, including Temporary Access Pass provisioning, are present in the production token."
      : `Missing token roles: ${missingRoles.join(", ")}.`,
  });

  try {
    const response = await fetch(
      "https://graph.microsoft.com/v1.0/users?$top=1&$select=id,userPrincipalName,accountEnabled",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = payload?.error?.message || `Microsoft Graph user read failed (${response.status}).`;
      throw new Error(message);
    }

    await response.json();
    checks.push({
      key: "graph-users",
      label: "Microsoft Graph user access",
      ok: true,
      detail: "Supabase successfully performed a non-destructive user read through Microsoft Graph.",
    });
  } catch (error) {
    checks.push({
      key: "graph-users",
      label: "Microsoft Graph user access",
      ok: false,
      detail: error instanceof Error ? error.message : "Microsoft Graph user access failed.",
    });
  }

  return {
    success: true,
    ready: checks.every((check) => check.ok),
    checkedAt: new Date().toISOString(),
    checks,
    requiredPermissions: REQUIRED_GRAPH_ROLES,
    configuredLicenseSku: licenseSku || null,
    runtime: {
      deploymentId: clean(Deno.env.get("DENO_DEPLOYMENT_ID")) || null,
      region: clean(Deno.env.get("SB_REGION")) || null,
    },
    note: "No Microsoft account, mailbox, password, Temporary Access Pass, or license was created or changed by this test. Secret values are never returned. The User Administrator directory-role assignment is verified separately.",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ success: false, error: "Supabase is not configured." }, 500);
  }

  const admin = await requireAdmin(req, supabaseUrl, anonKey, serviceRoleKey);
  if (!admin.ok) return json({ success: false, error: admin.error }, admin.status);

  try {
    return json(await runReadinessCheck());
  } catch (error) {
    console.error("career-microsoft-readiness failed", error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Microsoft readiness check failed.",
      },
      500,
    );
  }
});
