"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import GoogleAddressAutocomplete, {
  type GoogleAddressFields,
} from "@/components/GoogleAddressAutocomplete";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { createClient } from "@/lib/supabase-browser";

type SuccessState = {
  matchedExistingLocation: boolean;
  message: string;
  claimRequestId: string;
} | null;

const initialForm = {
  locationName: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  neighborhood: "",
  latitude: "",
  longitude: "",
  googlePlaceId: "",
  formattedAddress: "",
  phone: "",
  locationType: "",
  businessEmail: "",
  contactName: "",
  roleAtBusiness: "",
  website: "",
  planInterest: "partner_99",
  notes: "",
};

export default function NoCodeClaimPage() {
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState(initialForm);
  const [signedIn, setSignedIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<SuccessState>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const authResult = await supabase.auth.getUser();
      if (!active) return;
      const user = authResult.data.user;
      setSignedIn(Boolean(user));
      setForm((prev) => ({
        ...prev,
        businessEmail: prev.businessEmail || user?.email || "",
      }));
    }

    void loadUser();

    return () => {
      active = false;
    };
  }, [supabase]);

  function update(name: keyof typeof initialForm, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function updateAddress(address: GoogleAddressFields) {
    setForm((prev) => ({
      ...prev,
      address: address.address || address.formatted_address || prev.address,
      city: address.city || prev.city,
      state: address.state || prev.state,
      zipCode: address.zip_code || prev.zipCode,
      neighborhood: address.neighborhood || prev.neighborhood,
      latitude: address.latitude || prev.latitude,
      longitude: address.longitude || prev.longitude,
      googlePlaceId: address.google_place_id || prev.googlePlaceId,
      formattedAddress: address.formatted_address || prev.formattedAddress,
    }));
  }

  async function getCaptchaToken() {
    if (!turnstileSiteKey) return null;

    if (captchaToken && !turnstileRef.current?.isExpired()) return captchaToken;

    setCaptchaToken(null);
    turnstileRef.current?.reset();
    turnstileRef.current?.execute();

    try {
      const token = await turnstileRef.current?.getResponsePromise(30000, 250);
      return token || null;
    } catch {
      return null;
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const nextCaptchaToken = await getCaptchaToken();

      if (!nextCaptchaToken) {
        setError(
          "Security verification could not be completed. Please try again.",
        );
        return;
      }

      const res = await fetch("/api/business/claim/no-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, captchaToken: nextCaptchaToken }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(
          data.error === "captcha_failed"
            ? "Security verification could not be completed. Please try again."
            : "Could not submit your claim. Check the required fields and try again.",
        );
        turnstileRef.current?.reset();
        setCaptchaToken(null);
        return;
      }

      setSuccess(data);
    } catch {
      setError("Could not submit your claim. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <TheOutHavenHeader />
      <section className="relative overflow-hidden px-4 pb-20 pt-32 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(225,6,42,0.24),transparent_32%),linear-gradient(180deg,#090909,#050505)]" />
        <div className="relative mx-auto max-w-5xl">
          <Link
            href="/business/claim"
            className="text-sm font-black text-white/45 transition hover:text-white"
          >
            ← Back to claim options
          </Link>

          {success ? (
            <SuccessPanel success={success} signedIn={signedIn} />
          ) : (
            <div className="mt-8 grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">
                  Location claim
                </p>
                <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight sm:text-5xl">
                  Claim your business and activate your reservation portal
                </h1>
                <div className="mt-6 text-base leading-8 text-white/62 sm:text-lg">
                  <p>
                    TheOutHaven gives your business a standalone reservation system with a website embed, plus discovery inside TheOutHaven where customers plan complete outings.
                  </p>
                </div>
              </div>

              <form
                onSubmit={submit}
                className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/40 sm:p-6"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Location name"
                    value={form.locationName}
                    onChange={(value) => update("locationName", value)}
                    placeholder="Example: Haven Rooftop"
                    required
                    className="sm:col-span-2"
                  />
                  <div className="sm:col-span-2">
                    <GoogleAddressAutocomplete
                      label="Location Address"
                      value={form.address}
                      city={form.city}
                      state={form.state}
                      zip_code={form.zipCode}
                      neighborhood={form.neighborhood}
                      latitude={form.latitude}
                      longitude={form.longitude}
                      google_place_id={form.googlePlaceId}
                      formatted_address={form.formattedAddress}
                      onAddressChange={(value) => update("address", value)}
                      onAddressSelect={updateAddress}
                      required
                      inputClassName="mt-2 w-full rounded-2xl border border-white/10 bg-[#0d0d0d] px-4 py-4 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-[#e1062a]"
                      labelClassName="text-xs font-black uppercase tracking-[0.2em] text-white/40"
                      statusClassName="mt-2 text-xs font-bold text-white/40"
                      dropdownClassName="absolute z-[999999] mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#111] shadow-2xl"
                      predictionButtonClassName="block w-full border-b border-white/10 px-4 py-3 text-left text-sm font-bold text-white/80 transition last:border-b-0 hover:bg-white/10"
                    />
                  </div>
                  <Field
                    label="City"
                    value={form.city}
                    onChange={(value) => update("city", value)}
                    required
                  />
                  <Field
                    label="State"
                    value={form.state}
                    onChange={(value) => update("state", value)}
                    required
                  />
                  <Field
                    label="ZIP Code"
                    value={form.zipCode}
                    onChange={(value) => update("zipCode", value)}
                    required
                  />
                  <Field
                    label="Location Phone"
                    value={form.phone}
                    onChange={(value) => update("phone", value)}
                    type="tel"
                    required
                  />
                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                      Location Type <span className="text-[#e1062a]">*</span>
                    </span>
                    <select
                      value={form.locationType}
                      onChange={(event) =>
                        update("locationType", event.target.value)
                      }
                      required
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0d0d0d] px-4 py-4 text-sm font-bold text-white outline-none focus:border-[#e1062a]"
                    >
                      <option value="" disabled>
                        Select location type
                      </option>
                      <option value="Restaurant">Restaurant</option>
                      <option value="Lounge">Lounge</option>
                      <option value="Bar">Bar</option>
                      <option value="Cafe">Cafe</option>
                      <option value="Dessert Spot">Dessert Spot</option>
                      <option value="Activity">Activity</option>
                      <option value="Entertainment">Entertainment</option>
                      <option value="Event Space">Event Space</option>
                      <option value="Wellness">Wellness</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>
                  <Field
                    label="Website"
                    value={form.website}
                    onChange={(value) => update("website", value)}
                    type="url"
                  />
                  <Field
                    label="Contact name"
                    value={form.contactName}
                    onChange={(value) => update("contactName", value)}
                    required
                  />
                  <Field
                    label="Contact email"
                    value={form.businessEmail}
                    onChange={(value) => update("businessEmail", value)}
                    type="email"
                    required
                  />
                  <Field
                    label="Role at business"
                    value={form.roleAtBusiness}
                    onChange={(value) => update("roleAtBusiness", value)}
                    required
                  />
                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                      Plan interest
                    </span>
                    <select
                      value={form.planInterest}
                      onChange={(event) =>
                        update("planInterest", event.target.value)
                      }
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0d0d0d] px-4 py-4 text-sm font-bold text-white outline-none focus:border-[#e1062a]"
                    >
                      <option value="partner_99">TheOutHaven Partner Plan — $99/month</option>
                      <option value="free_discovery">Free Discovery</option>
                    </select>
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                      Notes
                    </span>
                    <textarea
                      value={form.notes}
                      onChange={(event) => update("notes", event.target.value)}
                      rows={4}
                      className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-[#0d0d0d] px-4 py-4 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-[#e1062a]"
                    />
                  </label>
                </div>

                {turnstileSiteKey ? (
                  <Turnstile
                    ref={turnstileRef}
                    siteKey={turnstileSiteKey}
                    options={{
                      theme: "dark",
                      size: "invisible",
                      execution: "execute",
                      appearance: "execute",
                    }}
                    onSuccess={(token) => setCaptchaToken(token)}
                    onExpire={() => setCaptchaToken(null)}
                    onError={() => setCaptchaToken(null)}
                  />
                ) : null}

                {error && (
                  <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-5 w-full rounded-2xl bg-[#e1062a] px-6 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/25 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting
                    ? "Submitting your claim..."
                    : "Claim and Review My Reservation Setup"}
                </button>
              </form>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
  className = "",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  className?: string;
  placeholder?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
        {label}
        {required ? <span className="text-[#e1062a]"> *</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0d0d0d] px-4 py-4 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-[#e1062a]"
      />
    </label>
  );
}

function SuccessPanel({
  success,
  signedIn,
}: {
  success: NonNullable<SuccessState>;
  signedIn: boolean;
}) {
  const matched = success.matchedExistingLocation;
  return (
    <section className="mx-auto mt-10 max-w-3xl rounded-[1.75rem] border border-emerald-400/25 bg-emerald-400/10 p-8 text-center">
      <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-200">
        Claim pending review
      </p>
      <h1 className="mt-4 text-3xl font-black sm:text-4xl">
        {matched ? "Location Already Added" : "Location Submitted for Review"}
      </h1>
      <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/68">
        Your claim has been submitted for review. Once approved, you’ll be able
        to access your location dashboard and add details such as photos,
        descriptions, hours, contact information, and plan options.
      </p>
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <Link
          href="/business"
          className="rounded-2xl bg-[#e1062a] px-6 py-4 text-sm font-black text-white transition hover:bg-red-500"
        >
          Back to Business
        </Link>
        {signedIn ? (
          <Link
            href="/locations/dashboard"
            className="rounded-2xl border border-white/15 bg-white/[0.05] px-6 py-4 text-sm font-black text-white/85 transition hover:bg-white hover:text-black"
          >
            Go to Dashboard
          </Link>
        ) : (
          <Link
            href="/login?next=/business/claim"
            className="rounded-2xl border border-white/15 bg-white/[0.05] px-6 py-4 text-sm font-black text-white/85 transition hover:bg-white hover:text-black"
          >
            Create Business Account
          </Link>
        )}
      </div>
    </section>
  );
}
