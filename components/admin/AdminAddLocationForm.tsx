"use client";

import { useState } from "react";

const emptyForm = {
  locationType: "restaurants",
  name: "",
  category: "",
  description: "",
  address: "",
  city: "",
  state: "",
  zip_code: "",
  phone: "",
  website: "",
  booking_url: "",
  image_url: "",
  rating: "",
  status: "approved",
};

export default function AdminAddLocationForm() {
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (key: keyof typeof emptyForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    const endpoint =
      form.locationType === "activities"
        ? "/api/admin/activities"
        : "/api/admin/restaurants";

    const body =
      form.locationType === "activities"
        ? {
            activity_name: form.name,
            activity_type: form.category,
            description: form.description,
            address: form.address,
            city: form.city,
            state: form.state,
            zip_code: form.zip_code,
            phone: form.phone,
            website: form.website,
            booking_url: form.booking_url,
            image_url: form.image_url,
            rating: Number(form.rating || 0),
            status: form.status,
          }
        : {
            restaurant_name: form.name,
            cuisine_type: form.category,
            description: form.description,
            address: form.address,
            city: form.city,
            state: form.state,
            zip_code: form.zip_code,
            phone: form.phone,
            website: form.website,
            reservation_url: form.booking_url,
            image_url: form.image_url,
            rating: Number(form.rating || 0),
            status: form.status,
          };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Unable to create location.");

      setMessage("Location created with a claim QR code. Refreshing list...");
      setForm(emptyForm);
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create location.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="add-location" className="mt-5 rounded-[1.75rem] border border-white/10 bg-[#120d0b] p-4 shadow-2xl">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">Create location</p>
          <h2 className="mt-2 text-2xl font-black">Add a restaurant or activity</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
            Admins can add locations directly from the dashboard. New locations receive an unclaimed claim QR automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/30 transition hover:scale-[1.02]"
        >
          {open ? "Close form" : "+ Add location"}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-5 grid gap-4 rounded-[1.5rem] border border-white/10 bg-black/25 p-4 lg:grid-cols-2">
          {message && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-200 lg:col-span-2">{message}</div>}
          {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200 lg:col-span-2">{error}</div>}

          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.22em] text-white/45">Type</span>
            <select value={form.locationType} onChange={(event) => update("locationType", event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-500">
              <option value="restaurants">Restaurant</option>
              <option value="activities">Activity</option>
            </select>
          </label>

          <Field label="Name" value={form.name} onChange={(value) => update("name", value)} required />
          <Field label={form.locationType === "activities" ? "Activity type" : "Cuisine type"} value={form.category} onChange={(value) => update("category", value)} />
          <Field label="Status" value={form.status} onChange={(value) => update("status", value)} />
          <Field label="Street address" value={form.address} onChange={(value) => update("address", value)} />
          <Field label="City" value={form.city} onChange={(value) => update("city", value)} />
          <Field label="State" value={form.state} onChange={(value) => update("state", value)} />
          <Field label="ZIP" value={form.zip_code} onChange={(value) => update("zip_code", value)} />
          <Field label="Phone" value={form.phone} onChange={(value) => update("phone", value)} />
          <Field label="Website" value={form.website} onChange={(value) => update("website", value)} />
          <Field label="Booking / reservation URL" value={form.booking_url} onChange={(value) => update("booking_url", value)} />
          <Field label="Image URL" value={form.image_url} onChange={(value) => update("image_url", value)} />
          <Field label="Rating" value={form.rating} onChange={(value) => update("rating", value)} placeholder="0-5" />

          <label className="block lg:col-span-2">
            <span className="text-xs font-black uppercase tracking-[0.22em] text-white/45">Description</span>
            <textarea value={form.description} onChange={(event) => update("description", event.target.value)} rows={4} className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-500" />
          </label>

          <button disabled={loading} className="rounded-full bg-white px-6 py-3 text-sm font-black text-black transition hover:bg-rose-100 disabled:opacity-60 lg:col-span-2">
            {loading ? "Creating..." : "Create location and QR"}
          </button>
        </form>
      )}
    </section>
  );
}

function Field({ label, value, onChange, placeholder, required }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.22em] text-white/45">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-500" />
    </label>
  );
}
