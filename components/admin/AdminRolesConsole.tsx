"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronRight,
  KeyRound,
  LockKeyhole,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
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
  admin_id: string;
  user_id: string | null;
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
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

function isBanned(value: string | null) {
  return Boolean(value && new Date(value).getTime() > Date.now());
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
  const [policies, setPolicies] = useState(initialPolicies);
  const [expandedRole, setExpandedRole] = useState<AdminRole | null>("admin");
  const [permissionSearch, setPermissionSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftPermissions, setDraftPermissions] = useState<AdminPermissionKey[]>([]);
  const [draftRole, setDraftRole] = useState<AdminRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [memberBusy, setMemberBusy] = useState<string | null>(null);
  const [memberMessage, setMemberMessage] = useState("");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, AdminRole>>({});

  const lockedSet = useMemo(() => new Set(lockedPermissions), [lockedPermissions]);
  const customizedCount = policies.filter((policy) => policy.customized).length;
  const microsoftRequiredCount = policies.filter((policy) => policy.role !== "superadmin").length;
  const roleOptions = policies.map((policy) => ({ value: policy.role, label: policy.label }));

  const staffCountByRole = useMemo(() => {
    const counts = new Map<AdminRole, number>();
    for (const member of staff) counts.set(member.role, (counts.get(member.role) || 0) + 1);
    return counts;
  }, [staff]);

  function openRole(role: AdminRole) {
    if (expandedRole === role) {
      setExpandedRole(null);
      setDraftRole(null);
      setMessage("");
      setMemberMessage("");
      setShowAddMember(false);
      return;
    }
    setExpandedRole(role);
    setDraftRole(null);
    setPermissionSearch("");
    setMemberSearch("");
    setMessage("");
    setMemberMessage("");
    setShowAddMember(false);
  }

  function beginDraft(policy: RolePolicy) {
    if (draftRole === policy.role) return;
    setDraftRole(policy.role);
    setDraftDescription(policy.description);
    setDraftPermissions([...policy.permissions]);
    setMessage("");
  }

  function activeDescription(policy: RolePolicy) {
    return draftRole === policy.role ? draftDescription : policy.description;
  }

  function activePermissions(policy: RolePolicy) {
    return draftRole === policy.role ? draftPermissions : policy.permissions;
  }

  function togglePermission(policy: RolePolicy, permission: AdminPermissionKey) {
    if (policy.role === "superadmin" || permission === "dashboard" || lockedSet.has(permission)) return;
    if (draftRole !== policy.role) {
      setDraftRole(policy.role);
      setDraftDescription(policy.description);
      setDraftPermissions(
        policy.permissions.includes(permission)
          ? policy.permissions.filter((item) => item !== permission)
          : [...policy.permissions, permission],
      );
      return;
    }
    setDraftPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    );
  }

  function updateDescription(policy: RolePolicy, value: string) {
    if (policy.role === "superadmin") return;
    if (draftRole !== policy.role) {
      setDraftRole(policy.role);
      setDraftPermissions([...policy.permissions]);
    }
    setDraftDescription(value);
  }

  function isDirty(policy: RolePolicy) {
    return policy.role !== "superadmin" && draftRole === policy.role && (
      draftDescription.trim() !== policy.description ||
      [...draftPermissions].sort().join("|") !== [...policy.permissions].sort().join("|")
    );
  }

  async function savePolicy(policy: RolePolicy) {
    if (!isDirty(policy)) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/system/role-policies/${policy.role}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: draftDescription, permissions: draftPermissions }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Role policy update failed.");
      setPolicies((current) => current.map((item) => item.role === policy.role ? json.policy : item));
      setDraftRole(null);
      setMessage("Role policy saved. Access changes are active.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Role policy update failed.");
    } finally {
      setSaving(false);
    }
  }

  async function resetPolicy(policy: RolePolicy) {
    if (policy.role === "superadmin" || !policy.customized) return;
    if (!window.confirm(`Reset ${policy.label} to the system default permissions?`)) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/system/role-policies/${policy.role}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Role policy reset failed.");
      setPolicies((current) => current.map((item) => item.role === policy.role ? json.policy : item));
      setDraftRole(null);
      setMessage("System defaults restored.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Role policy reset failed.");
    } finally {
      setSaving(false);
    }
  }

  async function addMember(role: AdminRole) {
    setMemberBusy("add");
    setMemberMessage("");
    try {
      const response = await fetch("/api/admin/system/role-members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, email: newMemberEmail, fullName: newMemberName }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Staff member could not be added.");
      setNewMemberEmail("");
      setNewMemberName("");
      setShowAddMember(false);
      setMemberMessage("Microsoft 365 staff access pre-authorized. The account will bind on first Microsoft sign-in.");
      router.refresh();
    } catch (error) {
      setMemberMessage(error instanceof Error ? error.message : "Staff member could not be added.");
    } finally {
      setMemberBusy(null);
    }
  }

  async function moveMember(member: StaffRow) {
    const nextRole = roleDrafts[member.admin_id] || member.role;
    if (nextRole === member.role) return;
    setMemberBusy(member.admin_id);
    setMemberMessage("");
    try {
      const response = await fetch(`/api/admin/system/role-members/${member.admin_id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Role assignment could not be changed.");
      setRoleDrafts((current) => {
        const next = { ...current };
        delete next[member.admin_id];
        return next;
      });
      setMemberMessage(`${member.email || "Staff member"} moved to ${roleOptions.find((item) => item.value === nextRole)?.label || nextRole}.`);
      router.refresh();
    } catch (error) {
      setMemberMessage(error instanceof Error ? error.message : "Role assignment could not be changed.");
    } finally {
      setMemberBusy(null);
    }
  }

  async function removeMember(member: StaffRow) {
    if (!window.confirm(`Remove TheOutHaven staff access for ${member.email || member.full_name || "this account"}? Their Microsoft 365 account will not be deleted.`)) return;
    setMemberBusy(member.admin_id);
    setMemberMessage("");
    try {
      const response = await fetch(`/api/admin/system/role-members/${member.admin_id}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Staff access could not be removed.");
      setMemberMessage("TheOutHaven staff access removed. Microsoft 365 was left unchanged.");
      router.refresh();
    } catch (error) {
      setMemberMessage(error instanceof Error ? error.message : "Staff access could not be removed.");
    } finally {
      setMemberBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={ShieldCheck} label="Active roles" value={String(policies.length)} detail="One current staff role catalog" />
        <Metric icon={Users} label="Staff accounts" value={String(staff.length)} detail="Assigned or pre-authorized" />
        <Metric icon={Settings2} label="Customized roles" value={String(customizedCount)} detail="Overrides from system defaults" />
        <Metric icon={KeyRound} label="Microsoft 365" value={`${microsoftRequiredCount}/${Math.max(policies.length - 1, 0)}`} detail="Required for every non-Superadmin" />
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0f]">
        <div className="border-b border-white/10 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Role directory</p>
              <h2 className="mt-2 text-xl font-black text-white">Click a role to manage everything inside it</h2>
              <p className="mt-1 text-sm font-semibold text-white/45">Members, Microsoft 365 status, permissions, role purpose, and audit activity expand in place.</p>
            </div>
            <div className="rounded-xl border border-sky-300/15 bg-sky-500/10 px-3 py-2 text-xs font-black text-sky-100">Microsoft 365 enforced</div>
          </div>
        </div>

        <div className="divide-y divide-white/10">
          {policies.map((policy) => {
            const expanded = policy.role === expandedRole;
            const roleMembers = staff.filter((member) => member.role === policy.role);
            const q = memberSearch.trim().toLowerCase();
            const filteredMembers = !q ? roleMembers : roleMembers.filter((member) => `${member.full_name || ""} ${member.email || ""}`.toLowerCase().includes(q));
            const enabledPermissions = activePermissions(policy);
            const permissionQuery = permissionSearch.trim().toLowerCase();
            const visiblePermissions = permissionKeys.filter((permission) => !permissionQuery || `${permission} ${formatPermission(permission)} ${permissionDescription(permission)}`.toLowerCase().includes(permissionQuery));
            const groups = GROUP_ORDER.map((group) => ({ group, permissions: visiblePermissions.filter((permission) => permissionGroup(permission) === group) })).filter((item) => item.permissions.length);
            const memberEmails = new Set(roleMembers.map((member) => member.email).filter(Boolean));
            const roleAudit = auditEvents.filter((event) => event.entity_id === policy.role || (event.target_email && memberEmails.has(event.target_email)) || event.summary?.toLowerCase().includes(policy.role.replaceAll("_", " "))).slice(0, 8);

            return (
              <div key={policy.role}>
                <button type="button" onClick={() => openRole(policy.role)} className={`flex w-full items-center gap-4 px-5 py-4 text-left transition sm:px-6 ${expanded ? "bg-white/[0.045]" : "hover:bg-white/[0.025]"}`} aria-expanded={expanded}>
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-black ${expanded ? "bg-rose-500/15 text-rose-100" : "bg-white/[0.06] text-white/65"}`}>{initials(policy.label)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-black text-white">{policy.label}</span>
                      {policy.role === "superadmin" ? <Badge text="Protected" tone="rose" /> : policy.customized ? <Badge text="Customized" tone="amber" /> : <Badge text="System default" tone="emerald" />}
                    </span>
                    <span className="mt-1 block text-xs font-semibold text-white/40">{roleMembers.length} assigned · {policy.permissions.length} permissions · {policy.role === "superadmin" ? "M365 + emergency" : "M365 required"}</span>
                  </span>
                  <span className="hidden text-right sm:block">
                    <span className="block text-xs font-black text-white/60">{roleMembers.length} {roleMembers.length === 1 ? "user" : "users"}</span>
                    <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-white/25">Click to {expanded ? "collapse" : "expand"}</span>
                  </span>
                  {expanded ? <ChevronDown className="h-5 w-5 text-white/50" /> : <ChevronRight className="h-5 w-5 text-white/25" />}
                </button>

                {expanded ? (
                  <div className="border-t border-white/10 bg-black/15 px-5 py-6 sm:px-6">
                    <div className="grid gap-3 lg:grid-cols-3">
                      <PolicyCard icon={KeyRound} label="Authentication" value={policy.role === "superadmin" ? "M365 + emergency" : "Microsoft 365 required"} detail={policy.role === "superadmin" ? "Only Superadmin retains emergency password access." : "Non-Microsoft admin sessions are rejected centrally."} />
                      <PolicyCard icon={Users} label="Assigned staff" value={String(roleMembers.length)} detail={`${roleMembers.filter((member) => !member.user_id).length} awaiting first Microsoft sign-in.`} />
                      <PolicyCard icon={ShieldCheck} label="Effective access" value={`${enabledPermissions.length} permissions`} detail={policy.customized ? `Customized ${relativeDate(policy.updated_at)}` : "Using maintained system defaults."} />
                    </div>

                    <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
                      <div className="flex flex-col gap-3 border-b border-white/10 bg-white/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-sm font-black text-white">Assigned users</h3>
                          <p className="mt-1 text-xs font-semibold text-white/40">Add, move, or remove TheOutHaven access without changing the employee&apos;s Microsoft 365 account.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {roleMembers.length > 4 ? (
                            <label className="relative block w-56">
                              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                              <input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search assigned users" className="w-full rounded-xl border border-white/10 bg-black/30 py-2 pl-8 pr-3 text-xs font-semibold text-white outline-none placeholder:text-white/25 focus:border-white/20" />
                            </label>
                          ) : null}
                          <button type="button" onClick={() => setShowAddMember((current) => !current)} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-black transition hover:bg-white/90"><UserPlus className="h-3.5 w-3.5" /> Add staff</button>
                        </div>
                      </div>

                      {showAddMember ? (
                        <div className="border-b border-white/10 bg-sky-500/[0.045] p-4">
                          <div className="grid gap-3 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1fr)_auto] lg:items-end">
                            <label className="block"><span className="text-[10px] font-black uppercase tracking-wider text-white/35">Name</span><input value={newMemberName} onChange={(event) => setNewMemberName(event.target.value)} placeholder="Employee name" className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm font-semibold text-white outline-none placeholder:text-white/25 focus:border-white/25" /></label>
                            <label className="block"><span className="text-[10px] font-black uppercase tracking-wider text-white/35">Microsoft 365 email</span><input type="email" value={newMemberEmail} onChange={(event) => setNewMemberEmail(event.target.value)} placeholder="name@theouthaven.com" className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm font-semibold text-white outline-none placeholder:text-white/25 focus:border-white/25" /></label>
                            <div className="flex gap-2"><button type="button" onClick={() => addMember(policy.role)} disabled={memberBusy === "add" || !newMemberEmail.trim()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-sky-100 px-4 py-2.5 text-xs font-black text-sky-950 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> {memberBusy === "add" ? "Adding…" : "Add"}</button><button type="button" onClick={() => setShowAddMember(false)} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 px-3 text-white/55"><X className="h-4 w-4" /></button></div>
                          </div>
                          <p className="mt-2 text-[11px] font-semibold text-sky-100/55">This pre-authorizes the email only. The staff record binds to the Supabase identity after the employee signs in through Microsoft 365 / Entra ID.</p>
                        </div>
                      ) : null}

                      <div className="divide-y divide-white/10">
                        {filteredMembers.length ? filteredMembers.map((member) => {
                          const pending = !member.user_id;
                          const banned = isBanned(member.banned_until);
                          const nextRole = roleDrafts[member.admin_id] || member.role;
                          return (
                            <div key={member.admin_id} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,.8fr)_auto] lg:items-center">
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-xs font-black text-white/70">{initials(member.full_name || member.email || "User")}</span>
                                <div className="min-w-0"><p className="truncate text-sm font-black text-white">{member.full_name || "Unnamed staff member"}</p><p className="mt-0.5 truncate text-xs font-semibold text-white/40">{member.email || "No email"}</p><div className="mt-2 flex flex-wrap gap-1.5">{pending ? <Badge text="Awaiting M365 sign-in" tone="amber" /> : <Badge text="M365 connected" tone="sky" />}{banned ? <Badge text="Access disabled" tone="rose" /> : null}{member.last_sign_in_at ? <Badge text={`Last sign-in ${relativeDate(member.last_sign_in_at)}`} tone="neutral" /> : null}</div></div>
                              </div>
                              <div className="flex items-center gap-2"><select value={nextRole} onChange={(event) => setRoleDrafts((current) => ({ ...current, [member.admin_id]: event.target.value as AdminRole }))} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-xs font-black text-white outline-none focus:border-white/25">{roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button type="button" onClick={() => moveMember(member)} disabled={memberBusy === member.admin_id || nextRole === member.role} className="rounded-xl bg-white px-3 py-2.5 text-xs font-black text-black disabled:opacity-30">Apply</button></div>
                              <button type="button" onClick={() => removeMember(member)} disabled={memberBusy === member.admin_id} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300/15 bg-rose-500/[0.07] px-3 py-2.5 text-xs font-black text-rose-100 transition hover:bg-rose-500/15 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /> Remove access</button>
                            </div>
                          );
                        }) : <div className="p-8 text-center"><Users className="mx-auto h-7 w-7 text-white/20" /><p className="mt-3 text-sm font-black text-white/55">No users assigned</p><p className="mt-1 text-xs font-semibold text-white/30">Use Add staff to pre-authorize a Microsoft 365 account for this role.</p></div>}
                      </div>
                    </div>

                    {memberMessage ? <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white/70">{memberMessage}</div> : null}

                    <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,.72fr)_minmax(0,1.28fr)]">
                      <div className="space-y-5">
                        <div className="rounded-2xl border border-white/10 p-4">
                          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Role settings</p><p className="mt-1 text-xs font-semibold text-white/35">Edit the role purpose and restore maintained defaults.</p></div>{policy.role === "superadmin" ? <LockKeyhole className="h-4 w-4 text-rose-200/70" /> : null}</div>
                          <label className="mt-4 block"><span className="text-[10px] font-black uppercase tracking-wider text-white/35">Role purpose</span><textarea value={activeDescription(policy)} onFocus={() => beginDraft(policy)} onChange={(event) => updateDescription(policy, event.target.value)} disabled={policy.role === "superadmin"} rows={5} className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm font-semibold leading-6 text-white outline-none focus:border-rose-300/35 disabled:opacity-55" /></label>
                          <div className="mt-4 flex flex-wrap gap-2">{policy.role !== "superadmin" ? <button type="button" onClick={() => resetPolicy(policy)} disabled={saving || !policy.customized} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs font-black text-white/65 disabled:opacity-30"><RotateCcw className="h-3.5 w-3.5" /> Reset defaults</button> : null}<button type="button" onClick={() => savePolicy(policy)} disabled={saving || !isDirty(policy)} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-black text-black disabled:opacity-30"><Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save role"}</button></div>
                          {message ? <p className="mt-3 text-xs font-bold text-white/50">{message}</p> : null}
                        </div>

                        <div className="rounded-2xl border border-white/10 p-4">
                          <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-white/45" /><h3 className="text-sm font-black text-white">Recent role activity</h3></div>
                          <div className="mt-3 space-y-3">{roleAudit.length ? roleAudit.map((event) => <div key={event.id} className="border-l border-white/10 pl-3"><p className="text-xs font-black text-white/65">{event.summary || event.action}</p><p className="mt-1 text-[10px] font-semibold text-white/30">{event.actor_email || "System"} · {relativeDate(event.created_at)}</p></div>) : <p className="text-xs font-semibold text-white/30">No recent changes for this role.</p>}</div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Permissions</p><p className="mt-1 text-xs font-semibold text-white/35">These permissions drive navigation and protected admin API access.</p></div><label className="relative block sm:w-64"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" /><input value={permissionSearch} onChange={(event) => setPermissionSearch(event.target.value)} placeholder="Search permissions" className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-8 pr-3 text-xs font-semibold text-white outline-none placeholder:text-white/25 focus:border-white/20" /></label></div>
                        <div className="mt-4 space-y-4">{groups.map(({ group, permissions }) => <div key={group} className="overflow-hidden rounded-xl border border-white/10"><div className="flex items-center justify-between border-b border-white/10 bg-white/[0.025] px-3 py-2.5"><h4 className="text-xs font-black text-white/70">{group}</h4><span className="text-[9px] font-black uppercase tracking-wider text-white/25">{permissions.filter((permission) => enabledPermissions.includes(permission)).length}/{permissions.length}</span></div><div className="grid gap-px bg-white/10 md:grid-cols-2">{permissions.map((permission) => { const ownerLocked = lockedSet.has(permission); const required = permission === "dashboard"; const checked = enabledPermissions.includes(permission); const disabled = policy.role === "superadmin" || ownerLocked || required; return <button key={permission} type="button" onClick={() => togglePermission(policy, permission)} disabled={disabled} className={`flex min-h-20 items-start gap-3 bg-[#0d0d0f] px-3 py-3 text-left ${disabled ? "cursor-default" : "hover:bg-white/[0.04]"}`}><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200" : "border-white/15 bg-black/25 text-transparent"}`}><Check className="h-3.5 w-3.5" /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-1.5 text-xs font-black text-white/80">{formatPermission(permission)}{ownerLocked ? <Badge text="Owner-only" tone="rose" /> : null}{required ? <Badge text="Required" tone="neutral" /> : null}</span><span className="mt-1 block text-[11px] font-semibold leading-5 text-white/30">{permissionDescription(permission)}</span></span></button>; })}</div></div>)}</div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Badge({ text, tone }: { text: string; tone: "rose" | "amber" | "emerald" | "sky" | "neutral" }) {
  const classes = tone === "rose" ? "border-rose-300/15 bg-rose-500/10 text-rose-100" : tone === "amber" ? "border-amber-300/15 bg-amber-500/10 text-amber-100" : tone === "emerald" ? "border-emerald-300/15 bg-emerald-500/10 text-emerald-100" : tone === "sky" ? "border-sky-300/15 bg-sky-500/10 text-sky-100" : "border-white/10 bg-white/[0.04] text-white/45";
  return <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${classes}`}>{text}</span>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof ShieldCheck; label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center gap-2 text-white/35"><Icon className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-[0.16em]">{label}</span></div><div className="mt-3 text-2xl font-black text-white">{value}</div><p className="mt-1 text-xs font-semibold text-white/35">{detail}</p></div>;
}

function PolicyCard({ icon: Icon, label, value, detail }: { icon: typeof ShieldCheck; label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-2 text-white/35"><Icon className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-[0.16em]">{label}</span></div><p className="mt-3 text-sm font-black text-white">{value}</p><p className="mt-1 text-xs font-semibold leading-5 text-white/35">{detail}</p></div>;
}
