"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const organizationTypes = [
  ["business", "Business"],
  ["restaurant_group", "Restaurant Group"],
  ["venue", "Venue"],
  ["promoter", "Event Promoter"],
  ["individual_organizer", "Independent Organizer"],
  ["nonprofit", "Nonprofit"],
  ["church", "Church / Faith Organization"],
  ["community", "Community Organization"],
  ["museum", "Museum / Cultural Organization"],
  ["creator", "Creator"],
  ["other", "Other"],
] as const;

export default function BusinessOrganizationForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [organizationType, setOrganizationType] = useState("business");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/business/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, legalName, organizationType }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to create organization.");
      router.push(payload.dashboardUrl || "/business/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Unable to create organization.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="organization-name" className="mb-2 block text-sm font-bold text-white/80">
          Organization name
        </label>
        <input
          id="organization-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoComplete="organization"
          className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-white outline-none focus:border-[#ec0b5b]"
          placeholder="Lucia Restaurant Group"
        />
      </div>

      <div>
        <label htmlFor="organization-type" className="mb-2 block text-sm font-bold text-white/80">
          Organization type
        </label>
        <select
          id="organization-type"
          value={organizationType}
          onChange={(event) => setOrganizationType(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-[#111] px-4 py-3 text-white outline-none focus:border-[#ec0b5b]"
        >
          {organizationTypes.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="legal-name" className="mb-2 block text-sm font-bold text-white/80">
          Legal name <span className="font-normal text-white/40">(optional)</span>
        </label>
        <input
          id="legal-name"
          value={legalName}
          onChange={(event) => setLegalName(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-white outline-none focus:border-[#ec0b5b]"
          placeholder="Lucia Hospitality LLC"
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-xl bg-[#ec0b5b] px-5 py-3 font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? "Creating organization…" : "Create Organization"}
      </button>
    </form>
  );
}
