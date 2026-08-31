"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, LockKeyhole, RefreshCw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { CREDENTIAL_PROVIDERS, type CredentialProviderId } from "@/lib/admin/credential-vault-catalog";
import type { CredentialVaultEnvironment, CredentialVaultProviderStatus } from "@/lib/aws/admin-credential-vault";

type ProviderState = CredentialVaultProviderStatus & { testDetail?: string; testState?: "healthy" | "configured" | "error" };

type ApiError = { ok?: false; error?: string };

function messageForError(error: string | undefined) {
  switch (error) {
    case "credential_vault_gateway_not_configured":
      return "The AWS credential vault gateway is not configured for this deployment.";
    case "credential_not_configured":
      return "Save at least one credential field before testing this provider.";
    case "no_credential_changes":
      return "Enter a new value or select a configured field to clear.";
    case "github_credential_test_failed":
      return "GitHub rejected the saved credential.";
    case "vercel_credential_test_failed":
      return "Vercel rejected the saved credential.";
    case "huggingface_credential_test_failed":
      return "Hugging Face rejected the saved credential.";
    case "resend_credential_test_failed":
      return "Resend rejected the saved credential.";
    case "supabase_credential_test_failed":
      return "Supabase rejected the saved credential.";
    case "twilio_credential_test_failed":
      return "Twilio rejected the saved credential.";
    case "meta_credential_test_failed":
      return "Meta rejected the saved credential.";
    case "microsoft_credential_test_failed":
      return "Microsoft rejected the saved application credentials.";
    default:
      return error || "The request could not be completed.";
  }
}

export default function CredentialsVaultClient() {
  const [environment, setEnvironment] = useState<CredentialVaultEnvironment>("production");
  const [statuses, setStatuses] = useState<Record<string, ProviderState>>({});
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [clearFields, setClearFields] = useState<Record<string, Set<string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const configuredCount = useMemo(
    () => Object.values(statuses).filter((item) => item.status === "configured").length,
    [statuses],
  );

  async function load(nextEnvironment: CredentialVaultEnvironment = environment) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/settings/credentials?environment=${encodeURIComponent(nextEnvironment)}`, { cache: "no-store" });
      const data = await response.json().catch(() => null) as { ok?: boolean; providers?: CredentialVaultProviderStatus[] } & ApiError | null;
      if (!response.ok || !data?.ok || !Array.isArray(data.providers)) throw new Error(messageForError(data?.error));
      setStatuses(Object.fromEntries(data.providers.map((provider) => [provider.provider, provider])));
      setValues({});
      setClearFields({});
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load credential status.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(environment);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environment]);

  function setField(provider: CredentialProviderId, key: string, value: string) {
    setValues((current) => ({
      ...current,
      [provider]: { ...(current[provider] || {}), [key]: value },
    }));
    setClearFields((current) => {
      const next = new Set(current[provider] || []);
      next.delete(key);
      return { ...current, [provider]: next };
    });
  }

  function toggleClear(provider: CredentialProviderId, key: string) {
    setClearFields((current) => {
      const next = new Set(current[provider] || []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...current, [provider]: next };
    });
    setValues((current) => ({ ...current, [provider]: { ...(current[provider] || {}), [key]: "" } }));
  }

  async function save(provider: CredentialProviderId) {
    setBusy(`save:${provider}`);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/admin/settings/credentials", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          environment,
          values: values[provider] || {},
          clearFields: Array.from(clearFields[provider] || []),
        }),
      });
      const data = await response.json().catch(() => null) as (CredentialVaultProviderStatus & { ok?: boolean }) & ApiError | null;
      if (!response.ok || !data?.ok) throw new Error(messageForError(data?.error));
      setStatuses((current) => ({ ...current, [provider]: data }));
      setValues((current) => ({ ...current, [provider]: {} }));
      setClearFields((current) => ({ ...current, [provider]: new Set() }));
      setSuccess(`${CREDENTIAL_PROVIDERS.find((item) => item.id === provider)?.label || provider} credentials saved.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save credentials.");
    } finally {
      setBusy(null);
    }
  }

  async function test(provider: CredentialProviderId) {
    setBusy(`test:${provider}`);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/admin/settings/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, environment }),
      });
      const data = await response.json().catch(() => null) as { ok?: boolean; status?: "healthy" | "configured"; detail?: string; error?: string } | null;
      if (!response.ok || !data?.ok) throw new Error(messageForError(data?.error));
      setStatuses((current) => ({
        ...current,
        [provider]: {
          ...(current[provider] || { provider, environment, configuredFields: [], updatedAt: null, versionId: null, status: "configured" }),
          testState: data.status,
          testDetail: data.detail,
        },
      }));
      setSuccess(data.detail || "Credential check completed.");
    } catch (requestError) {
      setStatuses((current) => ({
        ...current,
        [provider]: {
          ...(current[provider] || { provider, environment, configuredFields: [], updatedAt: null, versionId: null, status: "not_configured" }),
          testState: "error",
          testDetail: requestError instanceof Error ? requestError.message : "Credential check failed.",
        },
      }));
      setError(requestError instanceof Error ? requestError.message : "Credential check failed.");
    } finally {
      setBusy(null);
    }
  }

  async function clearProvider(provider: CredentialProviderId) {
    if (!window.confirm(`Clear all saved ${CREDENTIAL_PROVIDERS.find((item) => item.id === provider)?.label || provider} credentials for ${environment}?`)) return;
    setBusy(`clear:${provider}`);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/admin/settings/credentials?provider=${encodeURIComponent(provider)}&environment=${encodeURIComponent(environment)}`, { method: "DELETE" });
      const data = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !data?.ok) throw new Error(messageForError(data?.error));
      await load(environment);
      setSuccess(`${CREDENTIAL_PROVIDERS.find((item) => item.id === provider)?.label || provider} credentials cleared.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not clear credentials.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-rose-200">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-xs font-black uppercase tracking-[0.2em]">Superadmin only</span>
            </div>
            <h2 className="mt-2 text-2xl font-black text-white">Credential storage</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
              New values are write-only. After saving, the browser receives only field names, status, version metadata, and validation results. Secret values are never returned to this page.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-bold text-white/70">
              Environment
              <select
                value={environment}
                onChange={(event) => setEnvironment(event.target.value as CredentialVaultEnvironment)}
                className="ml-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-bold text-white outline-none focus:border-rose-300/50"
              >
                <option value="production">Production</option>
                <option value="staging">Staging</option>
              </select>
            </label>
            <button type="button" onClick={() => void load(environment)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-white hover:bg-white/[0.09]">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-black uppercase tracking-wider text-white/40">Providers</p><p className="mt-1 text-2xl font-black text-white">{CREDENTIAL_PROVIDERS.length}</p></div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-black uppercase tracking-wider text-white/40">Configured</p><p className="mt-1 text-2xl font-black text-emerald-200">{configuredCount}</p></div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-black uppercase tracking-wider text-white/40">Storage</p><p className="mt-1 text-base font-black text-white">AWS Secrets Manager</p></div>
        </div>
      </section>

      {error ? <div role="alert" className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100"><CircleAlert className="mr-2 inline h-4 w-4" />{error}</div> : null}
      {success ? <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100"><CheckCircle2 className="mr-2 inline h-4 w-4" />{success}</div> : null}

      <div className="grid gap-5 xl:grid-cols-2">
        {CREDENTIAL_PROVIDERS.map((provider) => {
          const status = statuses[provider.id];
          const configured = new Set(status?.configuredFields || []);
          return (
            <section key={provider.id} className="rounded-3xl border border-white/10 bg-[#120d0b] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-300/80">{provider.category}</p>
                  <h3 className="mt-1 text-xl font-black text-white">{provider.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/60">{provider.description}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wider ${status?.status === "configured" ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/[0.04] text-white/45"}`}>
                  {status?.status === "configured" ? "Configured" : "Not configured"}
                </span>
              </div>

              {provider.note ? <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-500/[0.06] px-4 py-3 text-xs leading-5 text-amber-100/80">{provider.note}</div> : null}

              <div className="mt-5 space-y-4">
                {provider.fields.map((field) => {
                  const isConfigured = configured.has(field.key);
                  const willClear = clearFields[provider.id]?.has(field.key) || false;
                  const currentValue = values[provider.id]?.[field.key] || "";
                  const common = "mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-rose-300/45";
                  return (
                    <div key={field.key}>
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-sm font-black text-white/80" htmlFor={`${provider.id}-${field.key}`}>{field.label}</label>
                        {isConfigured ? (
                          <button type="button" onClick={() => toggleClear(provider.id, field.key)} className={`text-xs font-black ${willClear ? "text-red-200" : "text-white/45 hover:text-white"}`}>
                            {willClear ? "Will clear" : "Clear saved value"}
                          </button>
                        ) : null}
                      </div>
                      {field.multiline ? (
                        <textarea
                          id={`${provider.id}-${field.key}`}
                          rows={4}
                          autoComplete="off"
                          value={currentValue}
                          onChange={(event) => setField(provider.id, field.key, event.target.value)}
                          placeholder={willClear ? "Saved value will be removed" : isConfigured ? "Saved securely — enter a replacement only" : field.placeholder || "Enter value"}
                          disabled={willClear}
                          className={common}
                        />
                      ) : (
                        <input
                          id={`${provider.id}-${field.key}`}
                          type={field.secret ? "password" : "text"}
                          autoComplete="new-password"
                          value={currentValue}
                          onChange={(event) => setField(provider.id, field.key, event.target.value)}
                          placeholder={willClear ? "Saved value will be removed" : isConfigured ? "Saved securely — enter a replacement only" : field.placeholder || "Enter value"}
                          disabled={willClear}
                          className={common}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {status?.testDetail ? (
                <div className={`mt-4 rounded-2xl border px-4 py-3 text-xs font-bold ${status.testState === "error" ? "border-red-300/15 bg-red-500/[0.07] text-red-100" : "border-emerald-300/15 bg-emerald-500/[0.07] text-emerald-100"}`}>
                  {status.testDetail}
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => void save(provider.id)} disabled={Boolean(busy)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-black text-white disabled:opacity-50">
                  {busy === `save:${provider.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
                </button>
                <button type="button" onClick={() => void test(provider.id)} disabled={Boolean(busy) || status?.status !== "configured"} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-white disabled:opacity-40">
                  {busy === `test:${provider.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Test connection
                </button>
                <button type="button" onClick={() => void clearProvider(provider.id)} disabled={Boolean(busy) || status?.status !== "configured"} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-300/10 bg-red-500/[0.05] px-4 text-sm font-black text-red-100 disabled:opacity-40">
                  {busy === `clear:${provider.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Clear provider
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold text-white/35">
                <span>{configured.size} field{configured.size === 1 ? "" : "s"} configured</span>
                {status?.updatedAt ? <span>Updated {new Date(status.updatedAt).toLocaleString()}</span> : null}
                {status?.versionId ? <span>Version {status.versionId.slice(0, 8)}</span> : null}
              </div>
            </section>
          );
        })}
      </div>

      <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
          <div>
            <h3 className="font-black text-white">Security boundaries</h3>
            <p className="mt-1 text-sm leading-6 text-white/60">
              This vault is for application and integration credentials only. Do not enter account passwords, recovery codes, AWS root credentials, personal login credentials, or payment-card information. Prefer OAuth, IAM roles, service accounts, and short-lived credentials whenever a provider supports them.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
