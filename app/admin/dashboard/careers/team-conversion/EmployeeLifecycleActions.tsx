"use client";

import { useState } from "react";

type Props = {
  conversionId?: string | null;
  applicationId?: string | null;
  companyEmail?: string | null;
  provisioningStatus?: string | null;
  offboardingStatus?: string | null;
};

export default function EmployeeLifecycleActions({ conversionId, applicationId, companyEmail, provisioningStatus, offboardingStatus }: Props) {
  const [busy, setBusy] = useState<"onboard" | "offboard" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: "onboard" | "offboard") {
    if (action === "offboard" && !window.confirm("Offboard this employee and revoke TheOutHaven access?")) return;
    setBusy(action);
    setMessage(null);
    try {
      const url = action === "onboard"
        ? `/api/admin/careers/team-conversion/${applicationId}/onboard`
        : `/api/admin/careers/team-conversion/${conversionId}/offboard`;
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) throw new Error(data?.error || "Employee lifecycle action failed.");
      setMessage(action === "onboard" ? `Employee provisioned${data.companyEmail ? ` as ${data.companyEmail}` : ""}.` : "Employee access revoked.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Employee lifecycle action failed.");
    } finally {
      setBusy(null);
    }
  }

  const canOnboard = Boolean(applicationId) && provisioningStatus !== "completed";
  const canOffboard = Boolean(conversionId) && provisioningStatus === "completed" && offboardingStatus !== "completed";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canOnboard ? <button type="button" disabled={busy !== null} onClick={() => run("onboard")} className="rounded-xl bg-rose-500 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{busy === "onboard" ? "Provisioning..." : "Provision Employee"}</button> : null}
      {canOffboard ? <button type="button" disabled={busy !== null} onClick={() => run("offboard")} className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-black text-red-100 disabled:opacity-50">{busy === "offboard" ? "Offboarding..." : "Offboard Employee"}</button> : null}
      {companyEmail ? <span className="text-xs text-white/55">{companyEmail}</span> : null}
      {message ? <span className="text-xs font-bold text-rose-200">{message}</span> : null}
    </div>
  );
}
