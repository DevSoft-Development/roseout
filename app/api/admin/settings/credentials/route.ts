import { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-api-auth";
import { logAdminAuditEvent } from "@/lib/admin-audit-log";
import {
  CREDENTIAL_PROVIDERS,
  allowedCredentialFieldKeys,
  getCredentialProvider,
  type CredentialProviderId,
} from "@/lib/admin/credential-vault-catalog";
import {
  getRuntimeCredentialStatus,
  getRuntimeCredentialValues,
} from "@/lib/admin/credential-runtime-inventory";
import {
  deleteCredentialVaultProvider,
  getCredentialVaultSummary,
  testCredentialVaultProvider,
  updateCredentialVaultProvider,
  type CredentialVaultEnvironment,
} from "@/lib/aws/admin-credential-vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function environmentFrom(value: unknown): CredentialVaultEnvironment | null {
  return value === "production" || value === "staging" ? value : null;
}

function providerFrom(value: unknown): CredentialProviderId | null {
  return getCredentialProvider(value)?.id ?? null;
}

function safeError(error: unknown) {
  const code = error instanceof Error ? error.message : "credential_vault_error";
  const allowed = new Set([
    "credential_vault_gateway_not_configured",
    "credential_vault_gateway_requires_https",
    "credential_not_configured",
    "runtime_credential_not_available",
    "github_credential_test_failed",
    "vercel_credential_test_failed",
    "huggingface_credential_test_failed",
    "resend_credential_test_failed",
    "supabase_credential_test_failed",
    "twilio_credential_test_failed",
    "meta_credential_test_failed",
    "microsoft_credential_test_failed",
  ]);
  return allowed.has(code) ? code : "credential_vault_request_failed";
}

export async function GET(request: NextRequest) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const environment = environmentFrom(request.nextUrl.searchParams.get("environment")) || "production";
  try {
    const summary = await getCredentialVaultSummary(environment);
    const providers = summary.providers.map((provider) => ({
      ...provider,
      ...getRuntimeCredentialStatus(provider.provider, provider.configuredFields),
    }));
    return Response.json({ ...summary, providers }, { headers: { "cache-control": "no-store" } });
  } catch (vaultError) {
    return Response.json({ ok: false, error: safeError(vaultError) }, { status: 502 });
  }
}

export async function PUT(request: NextRequest) {
  const { error, adminUser } = await requireSuperAdmin();
  if (error || !adminUser) return error || Response.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null) as {
    provider?: unknown;
    environment?: unknown;
    values?: unknown;
    clearFields?: unknown;
  } | null;

  const provider = providerFrom(body?.provider);
  const environment = environmentFrom(body?.environment);
  if (!provider || !environment || !body?.values || typeof body.values !== "object" || Array.isArray(body.values)) {
    return Response.json({ ok: false, error: "invalid_credential_request" }, { status: 400 });
  }

  const allowedFields = allowedCredentialFieldKeys(provider);
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(body.values as Record<string, unknown>)) {
    if (!allowedFields.has(key) || typeof value !== "string") {
      return Response.json({ ok: false, error: "invalid_credential_field" }, { status: 400 });
    }
    if (value.trim()) values[key] = value.trim();
  }

  const clearFields = Array.isArray(body.clearFields)
    ? body.clearFields.filter((value): value is string => typeof value === "string" && allowedFields.has(value))
    : [];

  if (!Object.keys(values).length && !clearFields.length) {
    return Response.json({ ok: false, error: "no_credential_changes" }, { status: 400 });
  }

  try {
    const result = await updateCredentialVaultProvider({ provider, environment, values, clearFields });
    await logAdminAuditEvent({
      actor: adminUser,
      action: "credential_vault.updated",
      entityType: "credential_provider",
      entityId: `${environment}:${provider}`,
      summary: `Updated ${provider} credentials for ${environment}`,
      afterData: {
        provider,
        environment,
        updatedFields: Object.keys(values),
        clearedFields: clearFields,
        configuredFields: result.configuredFields,
      },
      request,
    });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (vaultError) {
    return Response.json({ ok: false, error: safeError(vaultError) }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const { error, adminUser } = await requireSuperAdmin();
  if (error || !adminUser) return error || Response.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null) as {
    provider?: unknown;
    environment?: unknown;
    action?: unknown;
  } | null;
  const environment = environmentFrom(body?.environment);
  if (!environment) {
    return Response.json({ ok: false, error: "invalid_credential_request" }, { status: 400 });
  }

  try {
    if (body?.action === "import_all_runtime") {
      const summary = await getCredentialVaultSummary(environment);
      const existingByProvider = new Map(summary.providers.map((item) => [item.provider, item]));
      const migrated: Array<{ provider: CredentialProviderId; fields: string[] }> = [];
      const skipped: Array<{ provider: CredentialProviderId; reason: string }> = [];

      for (const definition of CREDENTIAL_PROVIDERS) {
        const current = existingByProvider.get(definition.id);
        if (current?.configuredFields?.length) {
          skipped.push({ provider: definition.id, reason: "already_vault_managed" });
          continue;
        }
        const values = getRuntimeCredentialValues(definition.id);
        if (!Object.keys(values).length) {
          const state = getRuntimeCredentialStatus(definition.id, []).migrationState;
          skipped.push({ provider: definition.id, reason: state });
          continue;
        }
        const result = await updateCredentialVaultProvider({ provider: definition.id, environment, values });
        migrated.push({ provider: definition.id, fields: result.configuredFields });
      }

      await logAdminAuditEvent({
        actor: adminUser,
        action: "credential_vault.runtime_imported_all",
        entityType: "credential_vault",
        entityId: environment,
        summary: `Imported all runtime-readable credentials into the central vault for ${environment}`,
        afterData: {
          environment,
          migrated: migrated.map((item) => ({ provider: item.provider, fields: item.fields })),
          skipped,
        },
        request,
      });
      return Response.json({ ok: true, migrated, skipped }, { headers: { "cache-control": "no-store" } });
    }

    const provider = providerFrom(body?.provider);
    if (!provider) {
      return Response.json({ ok: false, error: "invalid_credential_request" }, { status: 400 });
    }

    if (body?.action === "import_runtime") {
      const values = getRuntimeCredentialValues(provider);
      if (!Object.keys(values).length) {
        return Response.json({ ok: false, error: "runtime_credential_not_available" }, { status: 409 });
      }
      const result = await updateCredentialVaultProvider({ provider, environment, values });
      await logAdminAuditEvent({
        actor: adminUser,
        action: "credential_vault.runtime_imported",
        entityType: "credential_provider",
        entityId: `${environment}:${provider}`,
        summary: `Imported existing runtime ${provider} credentials into the central vault`,
        afterData: {
          provider,
          environment,
          importedFields: Object.keys(values),
          configuredFields: result.configuredFields,
        },
        request,
      });
      return Response.json({ ...result, migrationState: "vault_managed" }, { headers: { "cache-control": "no-store" } });
    }

    const result = await testCredentialVaultProvider(provider, environment);
    await logAdminAuditEvent({
      actor: adminUser,
      action: "credential_vault.tested",
      entityType: "credential_provider",
      entityId: `${environment}:${provider}`,
      summary: `Tested ${provider} credentials for ${environment}`,
      afterData: { provider, environment, status: result.status },
      request,
    });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (vaultError) {
    return Response.json({ ok: false, error: safeError(vaultError) }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  const { error, adminUser } = await requireSuperAdmin();
  if (error || !adminUser) return error || Response.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const provider = providerFrom(request.nextUrl.searchParams.get("provider"));
  const environment = environmentFrom(request.nextUrl.searchParams.get("environment"));
  if (!provider || !environment) {
    return Response.json({ ok: false, error: "invalid_credential_request" }, { status: 400 });
  }

  try {
    const result = await deleteCredentialVaultProvider(provider, environment);
    await logAdminAuditEvent({
      actor: adminUser,
      action: "credential_vault.cleared",
      entityType: "credential_provider",
      entityId: `${environment}:${provider}`,
      summary: `Cleared ${provider} credentials for ${environment}`,
      afterData: { provider, environment, configuredFields: [] },
      request,
    });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (vaultError) {
    return Response.json({ ok: false, error: safeError(vaultError) }, { status: 502 });
  }
}
