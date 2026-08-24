"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  BadgeCheck,
  Check,
  ChevronRight,
  KeyRound,
  LockKeyhole,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import AdminRoleManager from "@/components/admin/AdminRoleManager";
import type { AdminRole } from "@/lib/users/roles";
import type { AdminPermissionKey } from "@/lib/admin-permissions";

type RolePolicy = {
  role: AdminRole;
  label: string;
  description: string;
  permissions: AdminPermissionKey[];
  customized: boolean;
  updated_at: string | null;
};

type StaffRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: AdminRole;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
};

type AuditEvent = {
  id: string;
  actor_email: string | null;
  actor_role: string | null;
  target_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string | null;
  created_at: string;
};

type Tab = "roles" | "staff" | "activity";

const GROUP_ORDER = [
  "Core",
  "Locations & Claims",
  "Events & Reservations",
  "CRM & Communications",
  "Marketing & Content",
  "Careers & Team",
  "Security & System",
] as const;

function permissionGroup(permission: string) {
  if (["dashboard", "knowledgeBase", "analytics"].includes(permission)) return "Core";
  if (/^(locations|claims|claim|mailing|ownerAccounts|dataQuality|locationGrowth)/.test(permission)) return "Locations & Claims";
  if (/^(events|fraud|reservations|reservationLayouts)/.test(permission)) return "Events & Reservations";
  if (/^(crm|businessCrm|experienceInbox|communication|emailTemplates|sms)/.test(permission)) return "CRM & Communications";
  if (/^(campaigns|marketing|upgradeOpportunities|seo|reviews|giveaway)/.test(permission)) return "Marketing & Content";
  if (/^careers/.test(permission)) return "Careers & Team";
  return "Security & System";
}

function formatPermission(permission: string) {
  return permission
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/Qrs/g, "QRs")
    .replace(/Crm/g, "CRM")
    .replace(/Seo/g, "SEO")
    .replace(/^./, (char) => char.toUpperCase());
}

function permissionDescription(permission: string) {
  if (permission.endsWith("Delete")) return "Delete records or perform destructive actions.";
  if (permission.endsWith("Manage")) return "Create, update, and operate this area.";
  if (permission.endsWith("Edit")) return "Modify records and configuration in this area.";
  if (permission.endsWith("Send")) return "Send outbound messages or campaigns.";
  if (permission.endsWith("Approve")) return "Approve workflow items before release.";
  if (permission.endsWith("Publish")) return "Publish approved content or changes.";
  if (permission.endsWith("Enforce")) return "Apply enforcement or high-impact actions.";
  if (permission.endsWith("Create")) return "Create new records in this area.";
  if (permission.endsWith("View")) return "View this information without management access.";
  if (permission.endsWith("Request")) return "Submit requests for privileged actions.";
  return "Access this area of the administration console.";
}

function relativeDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

export default function AdminRolesConsole({
  initialPolicies,
  staff,
  auditEvents,
  permissionKeys,
  lockedPermissions,
}: {
  initialPolicies: RolePolicy[];
  staff: StaffRow[];
  auditEvents: AuditEvent[];
  permissionKeys: AdminPermissionKey[];
  lockedPermissions: AdminPermissionKey[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("roles");
  const [policies, setPolicies] = useState(initialPolicies);
  const [selectedRole, setSelectedRole] = useState<AdminRole>("admin");
  const [permissionSearch, setPermissionSearch] = useState("");
  const [staffSearch, setStaffSearch] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftPermissions, setDraftPermissions] = useState<AdminPermissionKey[]>([]);
  const [draftRole, setDraftRole] = useState<AdminRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const selected = policies.find((policy) => policy.role === selectedRole) || policies[0];
  const activeDescription = draftRole === selectedRole ? draftDescription : selected.description;
  const activePermissions = draftRole === selectedRole ? draftPermissions : selected.permissions;
  const lockedSet = useMemo(() => new Set(lockedPermissions), [lockedPermissions]);

  const staffCountByRole = useMemo(() => {
    const counts = new Map<AdminRole, number>();
    for (const member of staff) counts.set(member.role, (counts.get(member.role) || 0) + 1);
    return counts;
  }, [staff]);

  const roleOptions = policies.map((policy) => ({ value: policy.role, label: policy.label }));
  const customizedCount = policies.filter((policy) => policy.customized).length;
  const microsoftRequiredCount = policies.filter((policy) => policy.role !== "superadmin").length;

  const groups = useMemo(() => {
    const q = permissionSearch.trim().toLowerCase();
    const visible = permissionKeys.filter((permission) => {
      if (!q) return true;
      return `${permission} ${formatPermission(permission)} ${permissionDescription(permission)}`.toLowerCase().includes(q);
    });
    return GROUP_ORDER.map((group) => ({
      group,
      permissions: visible.filter((permission) => permissionGroup(permission) === group),
    })).filter((item) => item.permissions.length);
  }, [permissionKeys, permissionSearch]);

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((member) =>
      `${member.full_name || ""} ${member.email || ""} ${member.role}`.toLowerCase().includes(q),
    );
  }, [staff, staffSearch]);

  function beginDraft() {
    if (draftRole === selectedRole) return;
    setDraftRole(selectedRole);
    setDraftDescription(selected.description);
    setDraftPermissions([...selected.permissions]);
    setMessage("");
  }

  function selectRole(role: AdminRole) {
    setSelectedRole(role);
    setDraftRole(null);
    setPermissionSearch("");
    setMessage("");
  }

  function togglePermission(permission: AdminPermissionKey) {
    if (selectedRole === "superadmin" || permission === "dashboard" || lockedSet.has(permission)) return;
    beginDraft();
    const source = draftRole === selectedRole ? draftPermissions : selected.permissions;
    setDraftPermissions(
      source.includes(permission)
        ? source.filter((item) => item !== permission)
        : [...source, permission],
    );
    setDraftRole(selectedRole);
  }

  function updateDescription(value: string) {
    if (selectedRole === "superadmin") return;
    if (draftRole !== selectedRole) {
      setDraftPermissions([...selected.permissions]);
      setDraftRole(selectedRole);
    }
    setDraftDescription(value);
  }

  const dirty = selectedRole !== "superadmin" && draftRole === selectedRole && (
    draftDescription.trim() !== selected.description ||
    [...draftPermissions].sort().join("|") !== [...selected.permissions].sort().join("|")
  );

  async function savePolicy() {
    if (!dirty) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/system/role-policies/${selectedRole}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: draftDescription, permissions: draftPermissions }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Role policy update failed.");
      setPolicies((current) => current.map((policy) => policy.role === selectedRole ? json.policy : policy));
      setDraftRole(null);
      setMessage("Role policy saved. Access changes are now active.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Role policy update failed.");
    } finally {
      setSaving(false);
    }
  }

  async function resetPolicy() {
    if (selectedRole === "superadmin" || !selected.customized) return;
    if (!window.confirm(`Reset ${selected.label} to the system default permissions?`)) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/system/role-policies/${selectedRole}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Role policy reset failed.");
      setPolicies((current) => current.map((policy) => policy.role === selectedRole ? json.policy : policy));
      setDraftRole(null);
      setMessage("System defaults restored.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Role policy reset failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={ShieldCheck} label="System roles" value={String(policies.length)} detail="Central RBAC policies" />
        <Metric icon={Users} label="Staff accounts" value={String(staff.length)} detail="Authorized admin identities" />
        <Metric icon={Settings2} label="Customized roles" value={String(customizedCount)} detail="Overrides from system defaults" />
        <Metric icon={KeyRound} label="Microsoft 365" value={`${microsoftRequiredCount}/${policies.length - 1}`} detail="Required for all non-Superadmins" />
      </section>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-1.5">
        <TabButton active={tab === "roles"} onClick={() => setTab("roles")} icon={ShieldCheck}>Roles & permissions</TabButton>
        <TabButton active={tab === "staff"} onClick={() => setTab("staff")} icon={UserCog}>Staff assignments</TabButton>
        <TabButton active={tab === "activity"} onClick={() => setTab("activity")} icon={Activity}>Audit activity</TabButton>
      </div>

      {tab === "roles" ? (
        <div className="grid gap-5 xl:grid-cols-[330px,minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0f]">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Role directory</p>
              <p className="mt-2 text-sm font-semibold text-white/50">Select a role to review access, authentication policy, and assigned staff.</p>
            </div>
            <div className="max-h-[760px] overflow-y-auto p-2">
              {policies.map((policy) => {
                const active = policy.role === selectedRole;
                return (
                  <button
                    key={policy.role}
                    type="button"
                    onClick={() => selectRole(policy.role)}
                    className={`mb-1 flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${active ? "border-rose-400/30 bg-rose-500/10" : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"}`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black ${active ? "bg-rose-500/20 text-rose-100" : "bg-white/[0.06] text-white/65"}`}>
                      {initials(policy.label)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-black text-white">{policy.label}</span>
                        {policy.customized ? <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-200">Custom</span> : null}
                      </span>
                      <span className="mt-1 block text-xs font-semibold text-white/40">{staffCountByRole.get(policy.role) || 0} staff · {policy.permissions.length} permissions</span>
                    </span>
                    <ChevronRight className={`h-4 w-4 ${active ? "text-rose-200" : "text-white/25"}`} />
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0f]">
            <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,0.12),transparent_32%)] p-5 sm:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-black text-white">{selected.label}</h2>
                    {selected.role === "superadmin" ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-rose-300/20 bg-rose-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-100"><LockKeyhole className="h-3 w-3" /> Protected system role</span>
                    ) : selected.customized ? (
                      <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-100">Customized</span>
                    ) : (
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-100">System default</span>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-[11px] font-bold text-white/30">role:{selected.role}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.role !== "superadmin" ? (
                    <button type="button" onClick={resetPolicy} disabled={saving || !selected.customized} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-white/70 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"><RotateCcw className="h-3.5 w-3.5" /> Reset defaults</button>
                  ) : null}
                  <button type="button" onClick={savePolicy} disabled={saving || !dirty} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-black text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-35"><Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save changes"}</button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                <PolicyCard icon={KeyRound} label="Authentication" value={selected.role === "superadmin" ? "Microsoft 365 + emergency" : "Microsoft 365 required"} detail={selected.role === "superadmin" ? "Emergency password access is limited to Superadmin." : "Password-based admin access is blocked for this role."} />
                <PolicyCard icon={BadgeCheck} label="Assigned staff" value={String(staffCountByRole.get(selected.role) || 0)} detail="Accounts currently assigned to this role." />
                <PolicyCard icon={ShieldCheck} label="Effective access" value={`${activePermissions.length} permissions`} detail={selected.customized ? `Customized ${relativeDate(selected.updated_at)}` : "Using maintained system defaults."} />
              </div>
            </div>

            <div className="p-5 sm:p-6">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Role purpose</span>
                <textarea
                  value={activeDescription}
                  onFocus={beginDraft}
                  onChange={(event) => updateDescription(event.target.value)}
                  disabled={selected.role === "superadmin"}
                  rows={3}
                  className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold leading-6 text-white outline-none transition focus:border-rose-300/40 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              <div className="mt-7 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Permissions</p>
                  <p className="mt-1 text-sm font-semibold text-white/45">Changes affect both page access and protected admin API routes.</p>
                </div>
                <label className="relative block sm:w-72">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                  <input value={permissionSearch} onChange={(event) => setPermissionSearch(event.target.value)} placeholder="Search permissions" className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm font-semibold text-white outline-none placeholder:text-white/25 focus:border-white/20" />
                </label>
              </div>

              <div className="mt-5 space-y-5">
                {groups.map(({ group, permissions }) => (
                  <div key={group} className="overflow-hidden rounded-2xl border border-white/10">
                    <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.035] px-4 py-3">
                      <h3 className="text-sm font-black text-white">{group}</h3>
                      <span className="text-[10px] font-black uppercase tracking-wider text-white/30">{permissions.filter((permission) => activePermissions.includes(permission)).length}/{permissions.length} enabled</span>
                    </div>
                    <div className="grid gap-px bg-white/10 md:grid-cols-2">
                      {permissions.map((permission) => {
                        const ownerLocked = lockedSet.has(permission);
                        const baseLocked = permission === "dashboard";
                        const checked = activePermissions.includes(permission);
                        const disabled = selected.role === "superadmin" || ownerLocked || baseLocked;
                        return (
                          <button
                            key={permission}
                            type="button"
                            onClick={() => togglePermission(permission)}
                            disabled={disabled}
                            className={`flex min-h-20 items-start gap-3 bg-[#0d0d0f] px-4 py-3 text-left transition ${disabled ? "cursor-default" : "hover:bg-white/[0.04]"}`}
                          >
                            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200" : "border-white/15 bg-black/25 text-transparent"}`}>
                              <Check className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2 text-sm font-black text-white/85">
                                {formatPermission(permission)}
                                {ownerLocked ? <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-rose-200"><LockKeyhole className="h-2.5 w-2.5" /> Owner-only</span> : null}
                                {baseLocked ? <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white/40">Required</span> : null}
                              </span>
                              <span className="mt-1 block text-xs font-semibold leading-5 text-white/35">{permissionDescription(permission)}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {message ? <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white/70">{message}</div> : null}
            </div>
          </section>
        </div>
      ) : null}

      {tab === "staff" ? (
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0f]">
          <div className="flex flex-col gap-4 border-b border-white/10 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
            <div>
              <h2 className="text-xl font-black text-white">Staff role assignments</h2>
              <p className="mt-1 text-sm font-semibold text-white/45">Assign staff to a role. Microsoft 365 remains required for every role except Superadmin emergency access.</p>
            </div>
            <label className="relative block sm:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input value={staffSearch} onChange={(event) => setStaffSearch(event.target.value)} placeholder="Search name, email, or role" className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm font-semibold text-white outline-none placeholder:text-white/25 focus:border-white/20" />
            </label>
          </div>
          <div className="divide-y divide-white/10">
            {filteredStaff.map((member) => {
              const rolePolicy = policies.find((policy) => policy.role === member.role);
              const disabled = Boolean(member.banned_until && new Date(member.banned_until).getTime() > Date.now());
              return (
                <div key={member.user_id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(220px,.7fr)_minmax(320px,1fr)] lg:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-xs font-black text-white/75">{initials(member.full_name || member.email || "User")}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">{member.full_name || "Unnamed staff member"}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-white/40">{member.email || member.user_id}</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-black text-white/60">{rolePolicy?.label || member.role}</span>
                      <span className="rounded-full border border-sky-300/15 bg-sky-500/10 px-2.5 py-1 text-[10px] font-black text-sky-100">{member.role === "superadmin" ? "M365 + emergency" : "M365 required"}</span>
                      {disabled ? <span className="rounded-full border border-rose-300/15 bg-rose-500/10 px-2.5 py-1 text-[10px] font-black text-rose-100">Disabled</span> : null}
                    </div>
                    <p className="mt-2 text-xs font-semibold text-white/35">Last sign-in: {relativeDate(member.last_sign_in_at)}</p>
                  </div>
                  <div className="lg:justify-self-end">
                    <AdminRoleManager userId={member.user_id} currentRole={member.role} roles={roleOptions} />
                  </div>
                </div>
              );
            })}
            {!filteredStaff.length ? <div className="p-10 text-center text-sm font-semibold text-white/40">No staff match your search.</div> : null}
          </div>
        </section>
      ) : null}

      {tab === "activity" ? (
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0f]">
          <div className="border-b border-white/10 p-5 sm:p-6">
            <h2 className="text-xl font-black text-white">Role audit activity</h2>
            <p className="mt-1 text-sm font-semibold text-white/45">Immutable operational history for role assignments and permission-policy changes.</p>
          </div>
          <div className="divide-y divide-white/10">
            {auditEvents.map((event) => (
              <div key={event.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:items-start">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] text-white/50"><Activity className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p className="text-sm font-black text-white/85">{event.summary || formatPermission(event.action)}</p>
                  <p className="mt-1 text-xs font-semibold text-white/35">{event.actor_email || "System"}{event.target_email ? ` → ${event.target_email}` : event.entity_id ? ` · ${event.entity_id}` : ""}</p>
                </div>
                <span className="text-xs font-bold text-white/30 sm:pt-1">{relativeDate(event.created_at)}</span>
              </div>
            ))}
            {!auditEvents.length ? <div className="p-10 text-center text-sm font-semibold text-white/40">No role activity has been recorded yet.</div> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof ShieldCheck; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center justify-between gap-3"><span className="text-xs font-black uppercase tracking-[0.16em] text-white/35">{label}</span><Icon className="h-4 w-4 text-white/35" /></div>
      <p className="mt-3 text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-semibold text-white/35">{detail}</p>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: typeof ShieldCheck; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-black transition ${active ? "bg-white text-black" : "text-white/50 hover:bg-white/[0.05] hover:text-white"}`}>
      <Icon className="h-3.5 w-3.5" />{children}
    </button>
  );
}

function PolicyCard({ icon: Icon, label, value, detail }: { icon: typeof ShieldCheck; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/35"><Icon className="h-3.5 w-3.5" />{label}</div>
      <p className="mt-2 text-sm font-black text-white/90">{value}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-white/35">{detail}</p>
    </div>
  );
}
