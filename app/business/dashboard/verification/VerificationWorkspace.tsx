"use client";

import { useState } from "react";
import Link from "next/link";

export default function VerificationWorkspace({ organization, initialTrust, userEmail }: any) {
  const [trust, setTrust] = useState(initialTrust);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(action: string, payload: Record<string, unknown>) {
    setBusy(action);
    setMessage(null);
    try {
      const response = await fetch(`/api/business/organizations/${organization.id}/verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Request failed.");
      const refreshed = await fetch(`/api/business/organizations/${organization.id}/verification`, { cache: "no-store" });
      const next = await refreshed.json();
      if (refreshed.ok) setTrust(next);
      setMessage("Saved successfully.");
    } catch (error: any) {
      setMessage(error?.message || "Unable to save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#050505] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href={`/business/dashboard?organizationId=${organization.id}`} className="text-sm font-bold text-white/55 hover:text-white">← Business dashboard</Link>
            <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-[#ec0b5b]">Trust & Verification</p>
            <h1 className="mt-2 text-3xl font-black">{organization.name}</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/60">Organization verification proves the entity. Organizer verification controls event publishing trust. Payment/KYC verification is separate and will be handled later for paid ticketing.</p>
          </div>
        </div>

        {message ? <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">{message}</div> : null}

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-white/45">Organization Verification</p>
            <p className="mt-2 text-lg font-bold capitalize">{trust.organization?.verification_status || "unverified"}</p>
            <p className="mt-1 text-sm text-white/50">Trust level {trust.organization?.trust_level ?? 0}/5</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-white/45">Organizer Verification</p>
            <p className="mt-2 text-lg font-bold capitalize">{trust.organizerProfile?.verification_status || "not started"}</p>
            <p className="mt-1 text-sm text-white/50">Publishing: {trust.organizerProfile?.publishing_status || "review required"}</p>
          </div>
        </section>

        <form className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          submit("save_organizer_profile", {
            displayName: form.get("displayName"), bio: form.get("bio"), website: form.get("website"), instagram: form.get("instagram"), phone: form.get("phone"),
          });
        }}>
          <h2 className="text-xl font-black">Organizer profile</h2>
          <p className="mt-1 text-sm text-white/55">This is the organization-level identity that will appear on future event pages.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <input name="displayName" required defaultValue={trust.organizerProfile?.display_name || organization.name} placeholder="Organizer display name" className="rounded-xl border border-white/10 bg-black/40 px-4 py-3" />
            <input name="website" defaultValue={trust.organizerProfile?.website || ""} placeholder="Website" className="rounded-xl border border-white/10 bg-black/40 px-4 py-3" />
            <input name="instagram" defaultValue={trust.organizerProfile?.instagram || ""} placeholder="Instagram" className="rounded-xl border border-white/10 bg-black/40 px-4 py-3" />
            <input name="phone" defaultValue={trust.organizerProfile?.phone || ""} placeholder="Phone" className="rounded-xl border border-white/10 bg-black/40 px-4 py-3" />
            <textarea name="bio" defaultValue={trust.organizerProfile?.bio || ""} placeholder="Tell guests about your organization" className="min-h-28 rounded-xl border border-white/10 bg-black/40 px-4 py-3 sm:col-span-2" />
          </div>
          <button disabled={busy !== null} className="mt-4 rounded-xl bg-[#ec0b5b] px-4 py-2.5 text-sm font-black disabled:opacity-50">Save organizer profile</button>
        </form>

        <div className="grid gap-6 lg:grid-cols-2">
          <form className="rounded-2xl border border-white/10 bg-white/[0.035] p-5" onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            submit("submit_organization_verification", { legalName: form.get("legalName"), website: form.get("website"), contactEmail: form.get("contactEmail"), contactPhone: form.get("contactPhone") });
          }}>
            <h2 className="text-lg font-black">Verify organization</h2>
            <div className="mt-4 space-y-3">
              <input name="legalName" defaultValue={trust.organization?.legal_name || ""} placeholder="Legal or operating name" className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3" />
              <input name="website" defaultValue={trust.organizerProfile?.website || ""} placeholder="Website" className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3" />
              <input name="contactEmail" required defaultValue={userEmail} placeholder="Contact email" className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3" />
              <input name="contactPhone" placeholder="Contact phone" className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3" />
            </div>
            <button disabled={busy !== null || trust.organizationRequest?.status === "pending"} className="mt-4 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-black disabled:opacity-40">Submit organization verification</button>
          </form>

          <form className="rounded-2xl border border-white/10 bg-white/[0.035] p-5" onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            submit("submit_organizer_verification", { experienceSummary: form.get("experienceSummary"), socialLinks: { instagram: trust.organizerProfile?.instagram || null, website: trust.organizerProfile?.website || null } });
          }}>
            <h2 className="text-lg font-black">Verify organizer</h2>
            <p className="mt-1 text-sm text-white/55">Request publishing trust after your organizer profile is complete.</p>
            <textarea name="experienceSummary" placeholder="Describe your event, venue, promotion, or community-organizing experience." className="mt-4 min-h-36 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3" />
            <button disabled={busy !== null || !trust.organizerProfile || trust.organizerRequest?.status === "pending"} className="mt-4 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-black disabled:opacity-40">Submit organizer verification</button>
          </form>
        </div>
      </div>
    </main>
  );
}
