"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MarketingApprovalActions({ contentId, approvalId }: { contentId: string; approvalId: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function decide(decision: "approved" | "changes_requested" | "rejected") {
    setBusy(decision);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/marketing/content/${contentId}/approval`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approval_id: approvalId, decision, notes }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not record decision.");
      setMessage(decision === "approved" ? "Approved. Publishing records and reminders have been synchronized." : decision === "changes_requested" ? "Changes requested. A revision task was assigned to the content owner." : "Rejected. The approval task was completed and the content returned to draft.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record decision.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Decision</h2>
      <p className="mt-1 text-sm text-neutral-500">Approval applies only to the exact version shown above. Editing meaningful fields later requires reapproval.</p>
      <label className="mt-4 block space-y-1 text-sm font-medium">Reviewer notes<textarea className="min-h-28 w-full rounded-xl border p-3" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional for approval; recommended when requesting changes or rejecting." /></label>
      {message ? <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm font-medium">{message}</div> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <button type="button" disabled={Boolean(busy)} onClick={() => void decide("approved")} className="min-h-12 rounded-xl bg-emerald-700 px-4 font-semibold text-white disabled:opacity-50">{busy === "approved" ? "Approving…" : "Approve"}</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => void decide("changes_requested")} className="min-h-12 rounded-xl bg-amber-500 px-4 font-semibold text-black disabled:opacity-50">{busy === "changes_requested" ? "Sending…" : "Request Changes"}</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => void decide("rejected")} className="min-h-12 rounded-xl bg-red-700 px-4 font-semibold text-white disabled:opacity-50">{busy === "rejected" ? "Rejecting…" : "Reject"}</button>
      </div>
    </section>
  );
}
