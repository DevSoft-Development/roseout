import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  getCredentialVaultRuntimeSnapshot,
  updateCredentialVaultProvider,
} from "@/lib/aws/admin-credential-vault";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const metadata: Metadata = {
  title: "Platform Notifications | Admin",
  description: "Configure critical platform alert routing, quiet hours, and recovery notifications.",
};

export const dynamic = "force-dynamic";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function boolValue(value: unknown, fallback: boolean) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  return TRUE_VALUES.has(normalized);
}

function normalizedTime(value: FormDataEntryValue | null, fallback: string) {
  const raw = String(value || "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : fallback;
}

function normalizedPhone(value: FormDataEntryValue | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return /^\+[1-9]\d{7,14}$/.test(raw) ? raw : "";
}

function normalizedTimezone(value: FormDataEntryValue | null) {
  const raw = String(value || "").trim() || "America/New_York";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw }).format(new Date());
    return raw;
  } catch {
    return "America/New_York";
  }
}

function normalizedQuietMode(value: FormDataEntryValue | null) {
  const raw = String(value || "").trim();
  return ["off", "recoveries_only", "all"].includes(raw) ? raw : "recoveries_only";
}

async function saveAlertPolicy(formData: FormData) {
  "use server";
  await requireAdminRole(ADMIN_PAGE_ACCESS.productionFinishLine);

  const smsEnabled = formData.get("sms_enabled") === "on";
  const recoverySmsEnabled = formData.get("recovery_sms_enabled") === "on";
  const from = normalizedPhone(formData.get("sms_from"));
  const to = normalizedPhone(formData.get("sms_to"));
  const timezone = normalizedTimezone(formData.get("timezone"));
  const quietStart = normalizedTime(formData.get("quiet_start"), "22:00");
  const quietEnd = normalizedTime(formData.get("quiet_end"), "07:00");
  const quietMode = normalizedQuietMode(formData.get("quiet_mode"));

  await updateCredentialVaultProvider({
    provider: "platform",
    environment: "production",
    values: {
      criticalAlertSmsEnabled: smsEnabled ? "true" : "false",
      criticalAlertSmsRecoveryEnabled: recoverySmsEnabled ? "true" : "false",
      ...(from ? { criticalAlertSmsFrom: from } : {}),
      ...(to ? { criticalAlertSmsTo: to } : {}),
      criticalAlertTimezone: timezone,
      criticalAlertQuietHoursStart: quietStart,
      criticalAlertQuietHoursEnd: quietEnd,
      criticalAlertQuietHoursMode: quietMode,
    },
    clearFields: [
      ...(!from ? ["criticalAlertSmsFrom"] : []),
      ...(!to ? ["criticalAlertSmsTo"] : []),
    ],
  });

  revalidatePath("/admin/dashboard/infrastructure/notifications");
}

export default async function PlatformNotificationsPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.productionFinishLine);

  let values: Record<string, string> = {};
  let loadError: string | null = null;
  try {
    const snapshot = await getCredentialVaultRuntimeSnapshot("production", { force: true });
    values = snapshot.providers.platform || {};
  } catch (error) {
    loadError = error instanceof Error ? error.message : "platform_notification_policy_unavailable";
  }

  const smsEnabled = boolValue(values.criticalAlertSmsEnabled, true);
  const recoverySmsEnabled = boolValue(values.criticalAlertSmsRecoveryEnabled, true);
  const smsFrom = values.criticalAlertSmsFrom || "";
  const smsTo = values.criticalAlertSmsTo || "";
  const timezone = values.criticalAlertTimezone || "America/New_York";
  const quietStart = values.criticalAlertQuietHoursStart || "22:00";
  const quietEnd = values.criticalAlertQuietHoursEnd || "07:00";
  const quietMode = ["off", "recoveries_only", "all"].includes(values.criticalAlertQuietHoursMode || "")
    ? values.criticalAlertQuietHoursMode
    : "recoveries_only";

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Cloud & Platform"
        title="Platform Notifications"
        subtitle="Configure critical platform SMS delivery, recovery notifications, timezone, and quiet hours. The AWS alert relay reads this policy live from the central Credential Vault."
        badge={
          <AdminStatusBadge tone={loadError ? "amber" : smsEnabled ? "green" : "muted"}>
            {loadError ? "Policy unavailable" : smsEnabled ? "SMS enabled" : "SMS disabled"}
          </AdminStatusBadge>
        }
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/infrastructure/operations" variant="primary">
              Platform Operations
            </AdminActionButton>
            <AdminActionButton href="/admin/dashboard/infrastructure/incidents">
              Critical Incidents
            </AdminActionButton>
          </>
        }
      />

      {loadError ? (
        <AdminSectionCard className="border-amber-300/30 bg-amber-500/10 p-5">
          <p className="font-black text-amber-100">Notification policy could not be loaded.</p>
          <p className="mt-2 text-sm text-amber-100/70">{loadError}</p>
        </AdminSectionCard>
      ) : null}

      <form action={saveAlertPolicy} className="space-y-5">
        <AdminSectionCard className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">SMS delivery</p>
              <h2 className="mt-1 text-2xl font-black text-white">Critical alert routing</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
                Telnyx remains the delivery provider. API credentials stay in the Telnyx vault entry; this page stores only operational routing policy.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <label className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <span className="flex items-center gap-3">
                <input name="sms_enabled" type="checkbox" defaultChecked={smsEnabled} className="h-4 w-4" />
                <span className="font-black text-white">Send critical SMS alerts</span>
              </span>
              <span className="mt-2 block text-xs leading-5 text-white/45">
                When disabled, CloudWatch monitoring and incident history continue; only SMS delivery is suppressed.
              </span>
            </label>

            <label className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <span className="flex items-center gap-3">
                <input name="recovery_sms_enabled" type="checkbox" defaultChecked={recoverySmsEnabled} className="h-4 w-4" />
                <span className="font-black text-white">Send recovery SMS</span>
              </span>
              <span className="mt-2 block text-xs leading-5 text-white/45">
                Sends an SMS when a CloudWatch alarm returns to OK, subject to quiet-hours policy.
              </span>
            </label>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-white/45">SMS from</span>
              <input
                name="sms_from"
                defaultValue={smsFrom}
                placeholder="+1..."
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-rose-300/40"
              />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-white/45">SMS to</span>
              <input
                name="sms_to"
                defaultValue={smsTo}
                placeholder="+1..."
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-rose-300/40"
              />
            </label>
          </div>
        </AdminSectionCard>

        <AdminSectionCard className="p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">Notification window</p>
          <h2 className="mt-1 text-2xl font-black text-white">Quiet hours</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
            Critical alarms bypass quiet hours by default. The recommended policy suppresses only recovery messages overnight.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-white/45">Timezone</span>
              <input
                name="timezone"
                defaultValue={timezone}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-300/40"
              />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-white/45">Start</span>
              <input
                name="quiet_start"
                type="time"
                defaultValue={quietStart}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-300/40"
              />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-white/45">End</span>
              <input
                name="quiet_end"
                type="time"
                defaultValue={quietEnd}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-300/40"
              />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-white/45">Quiet-hours mode</span>
              <select
                name="quiet_mode"
                defaultValue={quietMode}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-300/40"
              >
                <option value="off">Off</option>
                <option value="recoveries_only">Recoveries only</option>
                <option value="all">All SMS</option>
              </select>
            </label>
          </div>
        </AdminSectionCard>

        <AdminSectionCard className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-white">Apply live policy</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-white/50">
                Saving updates the production platform entry in the central AWS Credential Vault. The alert relay reads the new values on its next invocation; no Lambda redeploy is required.
              </p>
            </div>
            <button
              type="submit"
              className="rounded-2xl border border-rose-300/30 bg-rose-500/20 px-5 py-3 text-sm font-black text-rose-100 transition hover:bg-rose-500/30"
            >
              Save notification policy
            </button>
          </div>
        </AdminSectionCard>
      </form>
    </AdminPageShell>
  );
}
