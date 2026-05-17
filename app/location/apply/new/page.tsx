"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import GoogleAddressAutocomplete, {
  type GoogleAddressFields,
} from "@/components/GoogleAddressAutocomplete";

declare global {
  interface Window {
    turnstile?: { render?: (element: HTMLElement, options: { sitekey: string; theme?: string }) => void; reset?: () => void };
    onTheOutHavenNewLocationTurnstileSuccess?: (token: string) => void;
    onTheOutHavenNewLocationTurnstileExpired?: () => void;
  }
}

type NewLocationFormState = {
  location_name: string;
  location_type: string;
  primary_category: string;
  request_type: string;
  website: string;
  instagram: string;
  external_reservation_url: string;
  main_image: string;
  image_url: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  neighborhood: string;
  latitude: string;
  longitude: string;
  google_place_id: string;
  formatted_address: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  notes: string;
};

const initialForm: NewLocationFormState = {
  location_name: "",
  location_type: "Restaurant",
  primary_category: "",
  request_type: "Add new location",
  website: "",
  instagram: "",
  external_reservation_url: "",
  main_image: "",
  image_url: "",
  address: "",
  city: "",
  state: "",
  zip_code: "",
  neighborhood: "",
  latitude: "",
  longitude: "",
  google_place_id: "",
  formatted_address: "",
  owner_name: "",
  owner_email: "",
  owner_phone: "",
  notes: "",
};

const locationTypes = [
  "Restaurant",
  "Activity",
  "Lounge / Nightlife",
  "Venue",
  "Other Experience",
];

const primaryCategories = [
  "Restaurant",
  "Bar / Lounge",
  "Nightlife",
  "Brunch",
  "Coffee / Dessert",
  "Activity",
  "Experience",
  "Entertainment",
  "Wellness",
  "Other",
];

export default function NewLocationPage() {
  const [form, setForm] = useState<NewLocationFormState>(initialForm);
  const [captchaToken, setCaptchaToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Add New Location | TheOutHaven";

    window.onTheOutHavenNewLocationTurnstileSuccess = (token: string) => {
      setCaptchaToken(token);
    };

    window.onTheOutHavenNewLocationTurnstileExpired = () => {
      setCaptchaToken("");
    };

    return () => {
      delete window.onTheOutHavenNewLocationTurnstileSuccess;
      delete window.onTheOutHavenNewLocationTurnstileExpired;
    };
  }, []);

  const updateField = (field: keyof NewLocationFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetCaptcha = () => {
    setCaptchaToken("");
    window.turnstile?.reset?.();
  };

  const submitNewLocation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setError("");
    setSuccess("");

    if (!form.location_name.trim()) {
      setError("Please enter the business / location name.");
      return;
    }

    if (!form.primary_category.trim()) {
      setError("Please choose a primary category.");
      return;
    }

    if (!form.address.trim()) {
      setError("Please select or enter the business address.");
      return;
    }

    if (!form.city.trim()) {
      setError("Please enter the city.");
      return;
    }

    if (!form.state.trim()) {
      setError("Please enter the state.");
      return;
    }

    if (!form.zip_code.trim()) {
      setError("Please enter the zip code.");
      return;
    }

    if (!form.owner_name.trim()) {
      setError("Please enter the owner or manager name.");
      return;
    }

    if (!form.owner_email.trim()) {
      setError("Please enter an email address.");
      return;
    }

    if (!captchaToken) {
      setError("Please complete the CAPTCHA before submitting.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/locations/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          image_url: form.image_url || form.main_image,
          plan: "free",
          flow: "add",
          captchaToken,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        resetCaptcha();
        return;
      }

      setSuccess(
        "Your location has been submitted. Our team will review it before it appears publicly."
      );
      setForm(initialForm);
      resetCaptcha();
    } catch {
      setError("Could not submit request. Please try again.");
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        async
        defer
      />
      <TheOutHavenHeader />

      <section className="relative overflow-hidden px-4 pb-20 pt-32 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(225,6,42,0.2),transparent_35%),linear-gradient(180deg,#050505,#000)]" />

        <div className="relative mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <Link
              href="/location/apply"
              className="text-sm font-black text-white/45 transition hover:text-white"
            >
              ← Back to options
            </Link>
            <p className="mt-8 text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">
              Add New Location
            </p>
            <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight sm:text-5xl md:text-6xl">
              Submit a new place for review.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-white/60 sm:text-lg">
              Add a restaurant, lounge, activity, or experience that is not on
              TheOutHaven yet. Google Address Autocomplete fills address details
              and hidden map coordinates for the team.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <InfoBox
                title="Complete listing details"
                text="Tell us the type, category, address, links, and contact information."
              />
              <InfoBox
                title="Team review"
                text="New locations are reviewed before they appear publicly on TheOutHaven."
              />
              <InfoBox
                title="Already listed?"
                text="Use the claim path instead if your business already appears in search."
              />
              <InfoBox
                title="Upgrade later"
                text="Reserve, analytics, QR tools, and guest operations can be added after approval."
              />
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[#0d0d0d] p-6 shadow-2xl shadow-black/40">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              New Location Request
            </p>
            <h2 className="mt-3 text-2xl font-black">Business details</h2>
            <p className="mt-2 text-sm leading-6 text-white/45">
              Latitude, longitude, Google Place ID, and formatted address are
              saved from autocomplete without showing coordinate fields.
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

            <form onSubmit={submitNewLocation} className="mt-6 space-y-4">
              <Field
                label="Business / Location Name"
                placeholder="New business name"
                value={form.location_name}
                onChange={(value) => updateField("location_name", value)}
                required
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Location Type"
                  value={form.location_type}
                  onChange={(value) => updateField("location_type", value)}
                  options={locationTypes}
                />
                <SelectField
                  label="Primary Category"
                  value={form.primary_category}
                  onChange={(value) => updateField("primary_category", value)}
                  options={["", ...primaryCategories]}
                  required
                />
              </div>

              <GoogleAddressAutocomplete
                label="Address"
                placeholder="Start typing and select the business address"
                value={form.address}
                address={form.address}
                city={form.city}
                state={form.state}
                zip_code={form.zip_code}
                neighborhood={form.neighborhood}
                latitude={form.latitude}
                longitude={form.longitude}
                google_place_id={form.google_place_id}
                formatted_address={form.formatted_address}
                onAddressChange={(value) => updateField("address", value)}
                onAddressSelect={(selected: GoogleAddressFields) =>
                  setForm((prev) => ({ ...prev, ...selected }))
                }
                inputClassName="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-[#e1062a]"
                labelClassName="text-xs font-black uppercase tracking-[0.2em] text-white/40"
                statusClassName="mt-2 text-xs font-semibold text-white/35"
                dropdownClassName="absolute z-[999999] mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] shadow-2xl shadow-black/60"
                predictionButtonClassName="block w-full border-b border-white/10 px-4 py-3 text-left text-sm font-bold text-white/75 transition last:border-b-0 hover:bg-white/10"
                required
              />

              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  label="City"
                  placeholder="City"
                  value={form.city}
                  onChange={(value) => updateField("city", value)}
                  required
                />
                <Field
                  label="State"
                  placeholder="State"
                  value={form.state}
                  onChange={(value) => updateField("state", value)}
                  required
                />
                <Field
                  label="Zip"
                  placeholder="Zip code"
                  value={form.zip_code}
                  onChange={(value) => updateField("zip_code", value)}
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Website"
                  placeholder="https://example.com"
                  value={form.website}
                  onChange={(value) => updateField("website", value)}
                  type="url"
                />
                <Field
                  label="Instagram / Social"
                  placeholder="https://instagram.com/example"
                  value={form.instagram}
                  onChange={(value) => updateField("instagram", value)}
                />
              </div>

              <Field
                label="External Reservation URL"
                placeholder="https://resy.com/..."
                value={form.external_reservation_url}
                onChange={(value) =>
                  updateField("external_reservation_url", value)
                }
                type="url"
              />

              <Field
                label="Main Image Upload or Image URL"
                placeholder="Paste an image URL or upload link"
                value={form.main_image}
                onChange={(value) => {
                  updateField("main_image", value);
                  updateField("image_url", value);
                }}
                type="url"
              />

              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  label="Contact Name"
                  placeholder="Full name"
                  value={form.owner_name}
                  onChange={(value) => updateField("owner_name", value)}
                  required
                />
                <Field
                  label="Contact Email"
                  placeholder="name@example.com"
                  value={form.owner_email}
                  onChange={(value) => updateField("owner_email", value)}
                  required
                  type="email"
                />
                <Field
                  label="Contact Phone"
                  placeholder="Phone number"
                  value={form.owner_phone}
                  onChange={(value) => updateField("owner_phone", value)}
                  type="tel"
                />
              </div>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                  Notes
                </span>
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(event) => updateField("notes", event.target.value)}
                  placeholder="Tell us anything helpful about this new location."
                  className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-[#e1062a]"
                />
              </label>

              <div className="rounded-2xl border border-white/10 bg-black p-4">
                <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-white/40">
                  Security Check <span className="text-[#e1062a]">*</span>
                </p>
                <div
                  className="cf-turnstile"
                  data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
                  data-callback="onTheOutHavenNewLocationTurnstileSuccess"
                  data-expired-callback="onTheOutHavenNewLocationTurnstileExpired"
                  data-theme="dark"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-[#e1062a] px-6 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/25 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Submitting..." : "Submit New Location"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  required,
  type = "text",
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
        {label}
        {required ? <span className="text-[#e1062a]"> *</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-[#e1062a]"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
        {label}
        {required ? <span className="text-[#e1062a]"> *</span> : null}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm font-bold text-white outline-none focus:border-[#e1062a]"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option || "Select a category"}
          </option>
        ))}
      </select>
    </label>
  );
}

function InfoBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <h3 className="text-lg font-black">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/45">{text}</p>
    </div>
  );
}
