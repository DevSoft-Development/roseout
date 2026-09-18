"use client";

import { useState } from "react";

function labelize(value: string | null | undefined) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

type TeamUser = {
  id: string;
  email: string | null;
  name: string | null;
};

type TeamProfile = {
  user_id?: string | null;
  team_type?: string | null;
  status?: string | null;
  pay_type?: string | null;
  hourly_rate?: number | null;
  notes?: string | null;
  allowed_work_types?: string[] | null;
  include_in_payroll?: boolean | null;
  can_clock_in?: boolean | null;
  can_track_work?: boolean | null;
  can_do_site_visits?: boolean | null;
  can_do_social_outreach?: boolean | null;
  can_work_support_tickets?: boolean | null;
  can_send_claim_codes?: boolean | null;
  can_send_owner_password_reset?: boolean | null;
  can_use_demo_mode?: boolean | null;
};

const WORK_TYPES = [
  "field_visit",
  "site_visit",
  "social_outreach",
  "phone_outreach",
  "email_outreach",
  "customer_support",
  "owner_support",
  "reservation_support",
  "claim_support",
  "listing_review",
  "photo_review",
  "quality_review",
  "crm_cleanup",
  "support_ticket",
  "follow_up",
  "email_follow_up",
  "phone_follow_up",
  "claim_code_delivery",
  "qr_dropoff",
  "owner_meeting",
  "reservation_setup",
  "reservation_demo",
  "onboarding_support",
  "team_review",
  "payroll_review",
  "proof_review",
  "training",
  "demo",
  "admin_work",
  "other",
] as const;

export function TeamMemberProfileForm({
  users,
  profile,
}: {
  users: TeamUser[];
  profile?: TeamProfile;
}) {
  const [message, setMessage] = useState("");
  const [teamType, setTeamType] = useState(profile?.team_type || "ambassador");

  async function submit(formData: FormData) {
    setMessage("Saving...");
    const allowedWorkTypes = Array.from(formData.getAll("allowedWorkTypes")).map(String);
    const body = {
      userId: formData.get("userId"),
      teamType,
      status: formData.get("status"),
      payType: formData.get("payType"),
      hourlyRate: formData.get("hourlyRate"),
      includeInPayroll: formData.get("includeInPayroll") === "on",
      canClockIn: formData.get("canClockIn") === "on",
      canTrackWork: formData.get("canTrackWork") === "on",
      canDoSiteVisits: formData.get("canDoSiteVisits") === "on",
      canDoSocialOutreach: formData.get("canDoSocialOutreach") === "on",
      canWorkSupportTickets: formData.get("canWorkSupportTickets") === "on",
      canSendClaimCodes: formData.get("canSendClaimCodes") === "on",
      canSendOwnerPasswordReset:
        formData.get("canSendOwnerPasswordReset") === "on",
      canUseDemoMode: formData.get("canUseDemoMode") === "on",
      allowedWorkTypes,
      notes: formData.get("notes"),
    };

    const res = await fetch("/api/admin/team/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setMessage(res.ok ? "Team member saved." : data.error || "Could not save team member.");
    if (res.ok) window.location.reload();
  }

  const flagFields: Array<[keyof TeamProfile, string]> = [
    ["include_in_payroll", "Include in payroll"],
    ["can_clock_in", "Can clock in"],
    ["can_track_work", "Can track work"],
    ["can_do_site_visits", "Site visits"],
    ["can_do_social_outreach", "Social outreach"],
    ["can_work_support_tickets", "Support tickets"],
    ["can_send_claim_codes", "Claim codes"],
    ["can_send_owner_password_reset", "Password reset"],
    ["can_use_demo_mode", "Demo mode"],
  ];

  return (
    <form action={submit} className="rounded-[2rem] border border-white/10 bg-[#111] p-5 sm:p-7">
      <h2 className="text-2xl font-black">Add / edit team member</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-bold text-white/65">
          User
          <select
            name="userId"
            defaultValue={profile?.user_id || ""}
            className="mt-2 w-full rounded-full border border-white/10 bg-black px-4 py-3 text-white"
          >
            <option value="">Select user</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name || user.email || user.id}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-bold text-white/65">
          Team type
          <select
            value={teamType}
            onChange={(event) => setTeamType(event.target.value)}
            className="mt-2 w-full rounded-full border border-white/10 bg-black px-4 py-3 text-white"
          >
            {[
              "ambassador",
              "experience_team",
              "sales_team",
              "support_team",
              "manager",
              "superadmin",
            ].map((type) => (
              <option key={type} value={type}>
                {labelize(type)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-bold text-white/65">
          Status
          <select
            name="status"
            defaultValue={profile?.status || "active"}
            className="mt-2 w-full rounded-full border border-white/10 bg-black px-4 py-3 text-white"
          >
            {["active", "inactive", "suspended", "training", "archived"].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>

        <label className="text-sm font-bold text-white/65">
          Pay type
          <select
            name="payType"
            defaultValue={profile?.pay_type || "hourly"}
            className="mt-2 w-full rounded-full border border-white/10 bg-black px-4 py-3 text-white"
          >
            {[
              "hourly",
              "commission",
              "hourly_plus_commission",
              "contractor",
              "training_only",
              "owner_or_training",
              "unpaid",
            ].map((payType) => (
              <option key={payType}>{payType}</option>
            ))}
          </select>
        </label>

        <label className="text-sm font-bold text-white/65">
          Hourly rate
          <input
            name="hourlyRate"
            type="number"
            step="0.01"
            defaultValue={profile?.hourly_rate ?? ""}
            className="mt-2 w-full rounded-full border border-white/10 bg-black px-4 py-3 text-white"
          />
        </label>

        <label className="text-sm font-bold text-white/65 md:col-span-2">
          Notes
          <textarea
            name="notes"
            defaultValue={profile?.notes || ""}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
          />
        </label>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {flagFields.map(([field, label]) => (
          <label
            key={field}
            className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm font-bold"
          >
            <input
              name={{
                include_in_payroll: "includeInPayroll",
                can_clock_in: "canClockIn",
                can_track_work: "canTrackWork",
                can_do_site_visits: "canDoSiteVisits",
                can_do_social_outreach: "canDoSocialOutreach",
                can_work_support_tickets: "canWorkSupportTickets",
                can_send_claim_codes: "canSendClaimCodes",
                can_send_owner_password_reset: "canSendOwnerPasswordReset",
                can_use_demo_mode: "canUseDemoMode",
              }[field]}
              type="checkbox"
              defaultChecked={
                profile
                  ? Boolean(profile[field])
                  : field !== "include_in_payroll"
              }
            />{" "}
            {label}
          </label>
        ))}
      </div>

      <div className="mt-5">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
          Allowed work types
        </p>
        <p className="mt-1 text-xs font-bold text-white/45">
          Leave all unchecked to use default work types for this team type.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {WORK_TYPES.map((type) => (
            <label
              key={type}
              className="rounded-2xl border border-white/10 bg-black/30 p-3 text-xs font-bold"
            >
              <input
                type="checkbox"
                name="allowedWorkTypes"
                value={type}
                defaultChecked={profile?.allowed_work_types?.includes(type)}
              />{" "}
              {labelize(type)}
            </label>
          ))}
        </div>
      </div>

      <button className="mt-5 rounded-full bg-white px-6 py-3 text-sm font-black text-black">
        Save team member
      </button>
      {message ? (
        <p className="mt-3 text-sm font-bold text-white/60">{message}</p>
      ) : null}
    </form>
  );
}
