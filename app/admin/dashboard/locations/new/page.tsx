"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

export default function NewAdminLocationPage() {
  const [locationType, setLocationType] = useState("restaurant");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    const endpoint =
      locationType === "activity" ? "/api/admin/activities" : "/api/admin/restaurants";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || "Could not create location.");
      setSaving(false);
      return;
    }

    const createdId = data.restaurant?.id || data.activity?.id;
    const createdType = locationType === "activity" ? "activities" : "restaurants";
    window.location.href = createdId
      ? `/admin/dashboard/locations/edit/${createdType}/${createdId}?from=/admin/dashboard/locations`
      : "/admin/dashboard/locations";
  }

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1000px]">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.24),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">
            Admin Locations
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Add Location</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
            Create a restaurant or activity with claim QR fields generated so it
            can be printed and claimed immediately.
          </p>
          <Link
            href="/admin/dashboard/locations"
            className="mt-5 inline-flex rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white"
          >
            ← Back to locations
          </Link>
        </section>

        <section className="mt-5 rounded-[2rem] border border-white/10 bg-[#f8f3ef] p-5 text-[#1b1210] shadow-2xl">
          <form onSubmit={handleSubmit} className="grid gap-5">
            <label className="block">
              <span className="text-sm font-black">Location type</span>
              <select
                value={locationType}
                onChange={(event) => setLocationType(event.target.value)}
                className="mt-2 h-12 w-full rounded-2xl border border-black/10 px-4 font-bold outline-none focus:border-rose-500"
              >
                <option value="restaurant">Restaurant</option>
                <option value="activity">Activity</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-black">Name</span>
              <input
                name={locationType === "activity" ? "activity_name" : "restaurant_name"}
                required
                className="mt-2 h-12 w-full rounded-2xl border border-black/10 px-4 font-bold outline-none focus:border-rose-500"
                placeholder="Location name"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <Input name="address" label="Address" />
              <Input name="city" label="City" />
              <Input name="state" label="State" />
              <Input name="zip_code" label="ZIP" />
              <Input name="phone" label="Phone" />
              <Input name="website" label="Website" />
              {locationType === "activity" ? (
                <Input name="activity_type" label="Activity Type" />
              ) : (
                <Input name="cuisine" label="Cuisine" />
              )}
              <Input name="image_url" label="Image URL" />
            </div>

            <label className="block">
              <span className="text-sm font-black">Description</span>
              <textarea
                name="description"
                rows={4}
                className="mt-2 w-full rounded-2xl border border-black/10 px-4 py-3 font-bold outline-none focus:border-rose-500"
                placeholder="Short location description"
              />
            </label>

            {message && (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">
                {message}
              </p>
            )}

            <button
              disabled={saving}
              className="w-fit rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg transition hover:scale-[1.03] disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Location"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function Input({ name, label }: { name: string; label: string }) {
  return (
    <label className="block">
      <span className="text-sm font-black">{label}</span>
      <input
        name={name}
        className="mt-2 h-12 w-full rounded-2xl border border-black/10 px-4 font-bold outline-none focus:border-rose-500"
        placeholder={label}
      />
    </label>
  );
}
