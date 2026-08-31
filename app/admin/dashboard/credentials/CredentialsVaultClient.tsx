"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, RefreshCw, Save, ShieldCheck, Trash2, UploadCloud } from "lucide-react";
import { CREDENTIAL_PROVIDERS, type CredentialProviderId } from "@/lib/admin/credential-vault-catalog";
import type { CredentialVaultEnvironment, CredentialVaultProviderStatus } from "@/lib/aws/admin-credential-vault";

type MigrationState = "vault_managed" | "runtime_importable" | "role_managed" | "reentry_required" | "not_configured";
type ProviderState = CredentialVaultProviderStatus & {
  externalConfiguredFields?: string[];
  externalSource?: string | null;
  migrationState?: MigrationState;
  testDetail?: string;
  testState?: "healthy" | "configured" | "error";
};

type ApiError = { ok?: false; error?: string };

function errorMessage(error?: string) {
  if (error === "runtime_credential_not_available") return "No runtime-readable credential is available for this provider. Re-enter or rotate it once to move it into the vault.";
  if (error === "credential_not_configured") return "This provider is not yet vault-managed.";
  if (error === "no_credential_changes") return "Enter a new value or select a saved field to clear.";
  return error || "The credential request could not be completed.";
}

function stateLabel(state?: MigrationState) {
  switch (state) {
    case "vault_managed": return "Vault managed";
    case "runtime_importable": return "Configured externally";
    case "role_managed": return "Role managed";
    case "reentry_required": return "Re-entry required";
    default: return "Not configured";
  }
}

function stateClass(state?: MigrationState) {
  if (state === "vault_managed" || state === "role_managed") return "border-emerald-300/25 bg-emerald-500/10 text-emerald-100";
  if (state === "runtime_importable") return "border-sky-300/25 bg-sky-500/10 text-sky-100";
  if (state === "reentry_required") return "border-amber-300/25 bg-amber-500/10 text-amber-100";
  return "border-white/10 bg-white/[0.04] text-white/45";
}

export default function CredentialsVaultClient() {
  const [environment, setEnvironment] = useState<CredentialVaultEnvironment>("production");
  const [statuses, setStatuses] = useState<Record<string, ProviderState>>({});
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const managedCount = useMemo(() => Object.values(statuses).filter((item) => item.migrationState === "vault_managed").length, [statuses]);
  const externalCount = useMemo(() => Object.values(statuses).filter((item) => item.migrationState === "runtime_importable").length, [statuses]);

  async function load(nextEnvironment: CredentialVaultEnvironment = environment) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/settings/credentials?environment=${encodeURIComponent(nextEnvironment)}`, { cache: "no-store" });
      const data = await response.json().catch(() => null) as ({ ok?: boolean; providers?: ProviderState[] } & ApiError) | null;
      if (!response.ok || !data?.ok || !Array.isArray(data.providers)) throw new Error(errorMessage(data?.error));
      setStatuses(Object.fromEntries(data.providers.map((provider) => [provider.provider, provider])));
      setValues({});
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load credential inventory.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(environment); }, [environment]);

  function setField(provider: CredentialProviderId, key: string, value: string) {
    setValues((current) => ({ ...current, [provider]: { ...(current[provider] || {}), [key]: value } }));
  }

  async function importExisting(provider: CredentialProviderId) {
    setBusy(`import:${provider}`); setError(null); setSuccess(null);
    try {
      const response = await fetch("/api/admin/settings/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, environment, action: "import_runtime" }),
      });
      const data = await response.json().catch(() => null) as ({ ok?: boolean; error?: string }) | null;
      if (!response.ok || !data?.ok) throw new Error(errorMessage(data?.error));
      await load(environment);
      setSuccess(`${CREDENTIAL_PROVIDERS.find((item) => item.id === provider)?.label || provider} was copied into AWS Secrets Manager without exposing the secret.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not import existing credentials.");
    } finally { setBusy(null); }
  }

  async function save(provider: CredentialProviderId) {
    setBusy(`save:${provider}`); setError(null); setSuccess(null);
    try {
      const providerValues = Object.fromEntries(Object.entries(values[provider] || {}).filter(([, value]) => value.trim()));
      const response = await fetch("/api/admin/settings/credentials", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, environment, values: providerValues, clearFields: [] }),
      });
      const data = await response.json().catch(() => null) as ({ ok?: boolean; error?: string }) | null;
      if (!response.ok || !data?.ok) throw new Error(errorMessage(data?.error));
      await load(environment);
      setSuccess(`${CREDENTIAL_PROVIDERS.find((item) => item.id === provider)?.label || provider} credentials saved to the central vault.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save credentials.");
    } finally { setBusy(null); }
  }

  async function test(provider: CredentialProviderId) {
    setBusy(`test:${provider}`); setError(null); setSuccess(null);
    try {
      const response = await fetch("/api/admin/settings/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, environment, action: "test" }),
      });
      const data = await response.json().catch(() => null) as { ok?: boolean; detail?: string; error?: string } | null;
      if (!response.ok || !data?.ok) throw new Error(errorMessage(data?.error));
      setSuccess(data.detail || "Credential test completed successfully.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Credential test failed.");
    } finally { setBusy(null); }
  }

  async function clearProvider(provider: CredentialProviderId) {
    if (!window.confirm(`Clear vault-managed ${provider} credentials for ${environment}? External configuration will not be deleted.`)) return;
    setBusy(`clear:${provider}`); setError(null); setSuccess(null);
    try {
      const response = await fetch(`/api/admin/settings/credentials?provider=${encodeURIComponent(provider)}&environment=${encodeURIComponent(environment)}`, { method: "DELETE" });
      const data = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !data?.ok) throw new Error(errorMessage(data?.error));
      await load(environment);
      setSuccess("Vault entry cleared. Existing external configuration was left untouched.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not clear vault entry.");
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-rose-200"><ShieldCheck className="h-5 w-5" /><span className="text-xs font-black uppercase tracking-[0.2em]">Superadmin only</span></div>
            <h2 className="mt-2 text-2xl font-black text-white">Central credential migration</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">Existing runtime secrets can be copied server-to-server into AWS Secrets Manager. Secret values are never returned to this browser. IAM/OIDC stays role-managed.</p>
          </div>
          <div className="flex items-center gap-3">
            <select value={environment} onChange={(event) => setEnvironment(event.target.value as CredentialVaultEnvironment)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-bold text-white">
              <option value="production">Production</option><option value="staging">Staging</option>
            </select>
            <button type="button" onClick={() => void load(environment)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-white"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-black uppercase tracking-wider text-white/40">Vault managed</p><p className="mt-1 text-2xl font-black text-emerald-200">{managedCount}</p></div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-black uppercase tracking-wider text-white/40">Ready to import</p><p className="mt-1 text-2xl font-black text-sky-200">{externalCount}</p></div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-black uppercase tracking-wider text-white/40">Providers</p><p className="mt-1 text-2xl font-black text-white">{CREDENTIAL_PROVIDERS.length}</p></div>
        </div>
      </section>

      {error ? <div role="alert" className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100"><CircleAlert className="mr-2 inline h-4 w-4" />{error}</div> : null}
      {success ? <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100"><CheckCircle2 className="mr-2 inline h-4 w-4" />{success}</div> : null}

      <div className="grid gap-5 xl:grid-cols-2">
        {CREDENTIAL_PROVIDERS.map((provider) => {
          const status = statuses[provider.id];
          const state = status?.migrationState;
          const configured = new Set(status?.configuredFields || []);
          const external = new Set(status?.externalConfiguredFields || []);
          return (
            <section key={provider.id} className="rounded-3xl border border-white/10 bg-[#120d0b] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-xs font-black uppercase tracking-[0.18em] text-rose-300/80">{provider.category}</p><h3 className="mt-1 text-xl font-black text-white">{provider.label}</h3><p className="mt-2 text-sm leading-6 text-white/60">{provider.description}</p></div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wider ${stateClass(state)}`}>{stateLabel(state)}</span>
              </div>

              {status?.externalSource && state !== "vault_managed" ? <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/55">Current source: <span className="font-bold text-white/80">{status.externalSource}</span></div> : null}
              {provider.note ? <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-500/[0.06] px-4 py-3 text-xs leading-5 text-amber-100/80">{provider.note}</div> : null}

              <div className="mt-5 space-y-4">
                {provider.fields.map((field) => {
                  const isConfigured = configured.has(field.key);
                  const isExternal = external.has(field.key);
                  return <div key={field.key}>
                    <div className="flex items-center justify-between gap-3"><label htmlFor={`${provider.id}-${field.key}`} className="text-sm font-black text-white/80">{field.label}</label><span className="text-[11px] font-bold text-white/40">{isConfigured ? "Vault" : isExternal ? "External" : "Missing"}</span></div>
                    {field.multiline ? <textarea id={`${provider.id}-${field.key}`} rows={3} autoComplete="off" value={values[provider.id]?.[field.key] || ""} onChange={(event) => setField(provider.id, field.key, event.target.value)} placeholder={isConfigured ? "Saved securely — enter only to replace" : isExternal ? "Configured externally — import or enter replacement" : field.placeholder || "Enter value"} className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none placeholder:text-white/25" /> : <input id={`${provider.id}-${field.key}`} type={field.secret ? "password" : "text"} autoComplete="new-password" value={values[provider.id]?.[field.key] || ""} onChange={(event) => setField(provider.id, field.key, event.target.value)} placeholder={isConfigured ? "Saved securely — enter only to replace" : isExternal ? "Configured externally — import or enter replacement" : field.placeholder || "Enter value"} className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none placeholder:text-white/25" />}
                  </div>;
                })}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {state === "runtime_importable" ? <button type="button" onClick={() => void importExisting(provider.id)} disabled={Boolean(busy)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-200 px-4 text-sm font-black text-slate-950 disabled:opacity-50">{busy === `import:${provider.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}Import existing</button> : null}
                {state !== "role_managed" ? <button type="button" onClick={() => void save(provider.id)} disabled={Boolean(busy)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-black disabled:opacity-50"><Save className="h-4 w-4" />Save / rotate</button> : null}
                {state === "vault_managed" ? <button type="button" onClick={() => void test(provider.id)} disabled={Boolean(busy)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-black text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />Test</button> : null}
                {state === "vault_managed" ? <button type="button" onClick={() => void clearProvider(provider.id)} disabled={Boolean(busy)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-300/15 px-4 text-sm font-black text-red-100 disabled:opacity-50"><Trash2 className="h-4 w-4" />Clear vault</button> : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
