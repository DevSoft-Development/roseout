"use client";

import { useState } from "react";
import type { SupportMessage, SupportTicket } from "@/lib/support";

type AdminAssignee = {
  email: string | null;
  full_name: string | null;
  role: string | null;
};

type Props = {
  ticket: SupportTicket;
  messages: SupportMessage[];
  accessKey?: string;
  adminMode?: boolean;
  canManageTicket?: boolean;
  adminUsers?: AdminAssignee[];
};

export default function SupportTicketConversation({
  ticket,
  messages,
  accessKey = "",
  adminMode = false,
  canManageTicket = false,
  adminUsers = [],
}: Props) {
  const [replyText, setReplyText] = useState("");
  const [items, setItems] = useState(messages);
  const [status, setStatus] = useState(ticket.status || "open");
  const [assignedEmail, setAssignedEmail] = useState(ticket.assigned_admin_email || "");
  const [assignedName, setAssignedName] = useState(ticket.assigned_admin_name || "");
  const [loading, setLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState("");


  const updateTicketStatus = async (nextStatus: string) => {
    if (updatingStatus || status === nextStatus) return;

    setUpdatingStatus(true);
    setError("");

    try {
      const res = await fetch(`/api/support/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Could not update ticket status.");
        return;
      }

      setStatus(data.ticket?.status || nextStatus);

      if (data.message) {
        setItems((prev) => [...prev, data.message]);
      }
    } catch {
      setError("Could not update ticket status. Please try again.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const assignTicket = async () => {
    if (!assignedEmail || assigning) return;

    setAssigning(true);
    setError("");

    try {
      const res = await fetch(`/api/support/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedAdminEmail: assignedEmail }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Could not assign ticket.");
        return;
      }

      setAssignedName(data.ticket?.assigned_admin_name || assignedEmail);

      if (data.message) {
        setItems((prev) => [...prev, data.message]);
      }
    } catch {
      setError("Could not assign ticket. Please try again.");
    } finally {
      setAssigning(false);
    }
  };

  const submitReply = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading || !replyText.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/support/tickets/${ticket.id}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: accessKey,
          actorType: adminMode ? "admin" : "creator",
          message: replyText,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Could not add reply.");
        return;
      }

      setItems((prev) => [...prev, data.reply]);
      setReplyText("");
    } catch {
      setError("Could not add reply. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="rounded-[2rem] border border-white/10 bg-[#111] p-5 shadow-2xl sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">
              {ticket.ticket_number || "Support Ticket"}
            </p>
            <h1 className="mt-2 text-3xl font-black">{ticket.subject}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-black">
              {status}
            </span>
            {canManageTicket && (
              <div className="flex flex-wrap gap-2">
                {status === "closed" ? (
                  <button
                    type="button"
                    onClick={() => updateTicketStatus("open")}
                    disabled={updatingStatus}
                    className="rounded-full border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-xs font-black uppercase tracking-wide text-rose-100 transition hover:bg-rose-500/20 disabled:opacity-60"
                  >
                    {updatingStatus ? "Updating..." : "Reopen Ticket"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => updateTicketStatus("closed")}
                    disabled={updatingStatus}
                    className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-500/20 disabled:opacity-60"
                  >
                    {updatingStatus ? "Updating..." : "Close Ticket"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {items.map((message) => {
            const admin = message.actor_type === "admin";
            return (
              <article
                key={message.id}
                className={`rounded-3xl border p-4 ${
                  admin
                    ? "border-rose-500/25 bg-rose-500/10"
                    : "border-white/10 bg-black/35"
                }`}
              >
                <div className="flex flex-wrap justify-between gap-2 text-xs font-black uppercase tracking-[0.2em] text-white/40">
                  <span>{admin ? "TheOutHaven Support" : message.author_name || "Requester"}</span>
                  <time>{new Date(message.created_at).toLocaleString()}</time>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white/75">{message.body}</p>
              </article>
            );
          })}
        </div>

        {status === "closed" ? (
          <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">
            This ticket is closed.
            {canManageTicket ? " Reopen it to add another reply." : ""}
          </div>
        ) : (
        <form onSubmit={submitReply} className="mt-6 space-y-3">
          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.22em] text-white/45">Reply</span>
            <textarea
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              rows={5}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-500"
              placeholder="Add a reply to this ticket..."
            />
          </label>
          {error && <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-bold text-red-200">{error}</p>}
          <button
            disabled={loading}
            className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg transition hover:scale-[1.02] disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send reply"}
          </button>
        </form>
        )}
      </section>

      <aside className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl sm:p-7">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-white/40">Ticket details</p>

        {canManageTicket && (
          <div className="mt-5 rounded-3xl border border-white/10 bg-black/35 p-4">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/35">
              Assigned admin
            </p>
            <p className="mt-1 text-sm font-bold text-white/80">
              {assignedName || assignedEmail || "Unassigned"}
            </p>
            <div className="mt-3 flex gap-2">
              <select
                value={assignedEmail}
                onChange={(event) => setAssignedEmail(event.target.value)}
                className="min-w-0 flex-1 rounded-full border border-white/10 bg-black px-3 py-2 text-xs font-bold text-white outline-none focus:border-rose-400"
              >
                <option value="">Select admin</option>
                {adminUsers.map((adminUser) => (
                  <option key={adminUser.email || adminUser.full_name} value={adminUser.email || ""}>
                    {adminUser.full_name || adminUser.email} ({adminUser.role})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={assignTicket}
                disabled={assigning || !assignedEmail}
                className="rounded-full bg-white px-4 py-2 text-xs font-black text-black transition hover:bg-rose-100 disabled:opacity-50"
              >
                {assigning ? "Saving..." : "Assign"}
              </button>
            </div>
          </div>
        )}

        <dl className="mt-5 space-y-4 text-sm">
          <Detail label="Name" value={ticket.requester_name || "Not provided"} />
          <Detail label="Email" value={ticket.requester_email} />
          <Detail label="Phone" value={ticket.requester_phone || "Not provided"} />
          <Detail label="Topic" value={ticket.topic || "General Support"} />
          <Detail label="Source" value={ticket.source || "support"} />
        </dl>
        <p className="mt-6 rounded-3xl border border-white/10 bg-black/35 p-4 text-sm leading-6 text-white/55">
          Replies from this page, email, or text will notify the other side and
          keep the conversation attached to this ticket.
        </p>
      </aside>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-black uppercase tracking-[0.22em] text-white/35">{label}</dt>
      <dd className="mt-1 font-bold text-white/80">{value}</dd>
    </div>
  );
}
