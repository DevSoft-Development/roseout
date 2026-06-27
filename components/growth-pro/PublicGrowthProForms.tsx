"use client";
import { useState } from "react";
import TurnstileField from "@/components/security/TurnstileField";

export function PublicLeadForm({ locationId, action, endpoint, button }: { locationId: string; action: string; endpoint: string; button: string }) {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    setMessage("Submitting…");
    const body = Object.fromEntries(formData.entries());
    const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, locationId, turnstileToken: token }) });
    const json = await res.json().catch(() => ({}));
    setMessage(json.error || json.message || (res.ok ? "Thanks — your request was submitted." : "We could not submit this form right now. Please try again in a moment."));
    if (!res.ok) setToken("");
  }
  return <form action={submit} className="mt-6 space-y-3 rounded-3xl border border-white/10 bg-white/[0.04] p-5"><input name="name" placeholder="Name" className="w-full rounded-xl bg-black/40 p-3"/><input name="email" placeholder="Email" className="w-full rounded-xl bg-black/40 p-3"/><input name="phone" placeholder="Phone" className="w-full rounded-xl bg-black/40 p-3"/><textarea name="notes" placeholder="Tell us what you need" className="min-h-28 w-full rounded-xl bg-black/40 p-3"/><TurnstileField action={action} onToken={setToken}/><button className="rounded-full bg-rose-600 px-5 py-3 font-black text-white">{button}</button>{message ? <p className="text-sm text-white/70">{message}</p> : null}</form>;
}
