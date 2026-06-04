"use client";
import { useState } from "react";

export function ClaimCodeForm({ locations }: { locations: any[] }) {
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    setMessage("Saving...");
    const body = { locationId: formData.get("locationId"), channel: formData.get("channel"), platform: formData.get("platform"), notes: formData.get("notes") };
    const res = await fetch("/api/workspace/claim-codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    setMessage(res.ok ? "Claim-code delivery logged/sent and audited." : data.error || "Could not send claim code.");
    if (res.ok) window.location.reload();
  }
  return <form action={submit} className="mt-6 rounded-[2rem] border border-white/10 bg-[#111] p-5"><h2 className="text-xl font-black">Send / log claim code</h2><div className="mt-4 grid gap-3 md:grid-cols-3"><select name="locationId" className="rounded-full border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white"><option value="">Select permitted location</option>{locations.map((l)=><option key={l.id} value={l.id}>{l.name||l.location_name||l.id}{l.do_not_contact?" (DNC)":""}</option>)}</select><select name="channel" className="rounded-full border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white">{["email","sms","instagram","facebook","tiktok","linkedin","website_contact_form","in_person","phone","other"].map((c)=><option key={c}>{c}</option>)}</select><input name="platform" placeholder="Platform for social channel" className="rounded-full border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white" /></div><textarea name="notes" placeholder="Reason, ticket context, or delivery notes" className="mt-3 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white"/><button className="mt-3 rounded-full bg-white px-5 py-3 text-sm font-black text-black">Save audited delivery</button>{message?<p className="mt-3 text-sm font-bold text-white/60">{message}</p>:null}</form>;
}
