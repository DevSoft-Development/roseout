"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type SupportTicketClientProps = {
  defaultSource?: string;
  compact?: boolean;
};

const topics = [
  "General Support",
  "Account Help",
  "Reservation Help",
  "Business / Owner Help",
  "Billing",
  "Bug Report",
  "Listing Correction",
];

export default function SupportTicketClient({
  defaultSource = "support_page",
  compact = false,
}: SupportTicketClientProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    topic: "General Support",
    subject: "",
    message: "",
  });
  const [ticketLookup, setTicketLookup] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const update = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const submitTicket = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setError("");
    setSuccess("");

    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError("Name, email, and message are required.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source: defaultSource }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Could not create ticket.");
        return;
      }

      setSuccess("Ticket created. Opening your ticket now...");
      router.push(data.ticketUrl);
    } catch {
      setError("Could not create ticket. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const openLookup = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = ticketLookup.trim();
    if (!value) return;

    if (value.startsWith("http") || value.startsWith("/support/tickets/")) {
      window.location.href = value;
      return;
    }

    setError("Paste the private ticket link from your email or text message.");
  };

  return (
    <div className={compact ? "grid gap-6" : "grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"}>
      <section className="rounded-[2rem] border border-white/10 bg-[#111] p-5 shadow-2xl sm:p-7">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">
          Submit a ticket
        </p>
        <h2 className="mt-2 text-2xl font-black">How can we help?</h2>
        <p className="mt-2 text-sm leading-6 text-white/50">
          Anyone can create a TheOutHaven support ticket. You will receive a private
          ticket link by email and text if a phone number is provided.
        </p>

        {success && (
          <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-200">
            {success}
          </div>
        )}
        {error && (
          <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={submitTicket} className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" value={form.name} onChange={(value) => update("name", value)} required />
            <Field label="Email" type="email" value={form.email} onChange={(value) => update("email", value)} required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone for text updates" value={form.phone} onChange={(value) => update("phone", value)} placeholder="Optional" />
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.22em] text-white/45">Topic</span>
              <select
                value={form.topic}
                onChange={(event) => update("topic", event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-500"
              >
                {topics.map((topic) => (
                  <option key={topic}>{topic}</option>
                ))}
              </select>
            </label>
          </div>

          <Field label="Subject" value={form.subject} onChange={(value) => update("subject", value)} placeholder="Optional short summary" />

          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.22em] text-white/45">Message</span>
            <textarea
              value={form.message}
              onChange={(event) => update("message", event.target.value)}
              required
              rows={6}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-500"
              placeholder="Tell us what happened and include links, reservation details, or account info that will help."
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Creating ticket..." : "Create support ticket"}
          </button>
        </form>
      </section>

      <aside className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl sm:p-7">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-white/40">
          View or reply
        </p>
        <h2 className="mt-2 text-2xl font-black">Already have a ticket?</h2>
        <p className="mt-2 text-sm leading-6 text-white/50">
          Open your private ticket link from your confirmation email or text to
          view the conversation and reply. Email replies also append to the ticket.
        </p>

        <form onSubmit={openLookup} className="mt-6 space-y-3">
          <input
            value={ticketLookup}
            onChange={(event) => setTicketLookup(event.target.value)}
            placeholder="Paste private ticket link"
            className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-500"
          />
          <button className="w-full rounded-full border border-white/10 bg-white px-6 py-3 text-sm font-black text-black transition hover:bg-rose-100">
            Open ticket
          </button>
        </form>

        <div className="mt-6 rounded-3xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white/55">
          <p className="font-black text-white">Need urgent help?</p>
          <p className="mt-1">
            Submit a ticket and include your reservation date, location name,
            and best callback number so support can prioritize the request.
          </p>
          <Link href="/contact" className="mt-4 inline-flex font-black text-rose-300 hover:text-rose-200">
            Contact page →
          </Link>
        </div>
      </aside>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.22em] text-white/45">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-500"
      />
    </label>
  );
}
