"use client";

import { useEffect, useState } from "react";

export default function VerificationQueue({ type }: { type: "organization" | "organizer" }) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const response = await fetch(`/api/admin/trust/verification?type=${type}`, { cache: "no-store" });
    const body = await response.json();
    setRequests(response.ok ? body.requests || [] : []);
    if (!response.ok) setMessage(body.error || "Unable to load verification requests.");
    setLoading(false);
  }

  useEffect(() => { void load(); }, [type]);

  async function review(requestId: string, decision: "approved" | "rejected" | "needs_more_info", approvedTrustLevel = 1) {
    setMessage(null);
    const notes = decision === "approved" ? null : window.prompt(decision === "rejected" ? "Reason for rejection" : "What additional information is needed?") || null;
    if (decision !== "approved" && !notes) return;
    const response = await fetch("/api/admin/trust/verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, requestId, decision, notes, approvedTrustLevel }),
    });
    const body = await response.json();
    if (!response.ok) return setMessage(body.error || "Review failed.");
    setMessage("Verification review saved.");
    await load();
  }

  return (
    <div className="space-y-4">
      {message ? <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">{message}</div> : null}
      {loading ? <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/50">Loading requests…</div> : null}
      {!loading && !requests.length ? <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"><p className="font-bold">No open requests</p><p className="mt-1 text-sm text-white/50">New {type} verification requests will appear here.</p></div> : null}
      {requests.map((request) => (
        <article key={request.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ec0b5b]">{request.status}</p>
              <h2 className="mt-1 text-lg font-black">{request.organization?.name || "Organization"}</h2>
              <p className="mt-1 text-sm text-white/50">{request.organization?.organization_type || "business"}</p>
            </div>
            {type === "organizer" ? <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60">Requested trust L{request.requested_trust_level || 1}</div> : null}
          </div>
          <div className="mt-4 grid gap-3 text-sm text-white/70 sm:grid-cols-2">
            {request.legal_name ? <p><span className="text-white/40">Legal name:</span> {request.legal_name}</p> : null}
            {request.contact_email ? <p><span className="text-white/40">Email:</span> {request.contact_email}</p> : null}
            {request.contact_phone ? <p><span className="text-white/40">Phone:</span> {request.contact_phone}</p> : null}
            {request.website ? <p><span className="text-white/40">Website:</span> {request.website}</p> : null}
            {request.experience_summary ? <p className="sm:col-span-2"><span className="text-white/40">Experience:</span> {request.experience_summary}</p> : null}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={() => review(request.id, "approved", type === "organizer" ? 1 : 0)} className="rounded-lg bg-[#ec0b5b] px-3 py-2 text-xs font-black">Approve</button>
            {type === "organizer" ? <button onClick={() => review(request.id, "approved", 4)} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-black">Approve as Trusted L4</button> : null}
            <button onClick={() => review(request.id, "needs_more_info")} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-black">Needs Info</button>
            <button onClick={() => review(request.id, "rejected")} className="rounded-lg border border-red-400/20 px-3 py-2 text-xs font-black text-red-200">Reject</button>
          </div>
        </article>
      ))}
    </div>
  );
}
