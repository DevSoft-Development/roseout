"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import GoogleAddressAutocomplete, {
  type GoogleAddressFields,
} from "@/components/GoogleAddressAutocomplete";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import BusinessLocationLookup from "@/components/business/BusinessLocationLookup";
import type { OnboardingLocation } from "@/lib/locations/onboarding";
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
  ownershipAttested: false,
  website: "",
  planInterest: "pro",
  planInterval: "monthly",
  selectedLocationId: "",
  notes: "",
};

export default function NoCodeClaimPage() {
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState(initialForm);
  const [signedIn, setSignedIn] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [selectedLocation, setSelectedLocation] =
    useState<OnboardingLocation | null>(null);
  const [locationPathChosen, setLocationPathChosen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<SuccessState>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const canCompleteClaim = signedIn && emailVerified;
  const claimReturnPath = `/business/claim/no-code?plan=${form.planInterval}${
    selectedLocation ? `&location=${selectedLocation.id}` : "&mode=new"
  }`;

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const authResult = await supabase.auth.getUser();
      if (!active) return;
      const user = authResult.data.user;
      setSignedIn(Boolean(user));
      setEmailVerified(Boolean(user?.email_confirmed_at || user?.confirmed_at));
      setAccountEmail(user?.email || "");
      setAuthChecked(true);
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

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const interval = params.get("plan");
    const locationId = params.get("location");
    const addingNewLocation = params.get("mode") === "new";
    let timer: number | undefined;
    if (interval === "annual") {
      timer = window.setTimeout(() => {
        setForm((prev) => ({ ...prev, planInterval: "annual", planInterest: "pro" }));
      }, 0);
    }
    if (addingNewLocation) {
      setLocationPathChosen(true);
    }
    if (locationId) {
      void fetch(
        `/api/business/onboarding/location-search?id=${encodeURIComponent(locationId)}`,
      )
        .then((response) => response.json())
        .then((payload) => {
          const location = payload.locations?.[0] as OnboardingLocation | undefined;
          if (active && location && !location.alreadyClaimed) {
            setSelectedLocation(location);
            setLocationPathChosen(true);
            setForm((prev) => ({
              ...prev,
              selectedLocationId: location.id,
              locationName: location.name,
              address: location.address || "",
              city: location.city || "",
              state: location.state || "",
              zipCode: location.zipCode || "",
              phone: location.phone || "",
              website: location.website || "",
              locationType:
                location.locationType === "restaurant" ? "Restaurant" : "Activity",
            }));
          }
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  function update(name: Exclude<keyof typeof initialForm, "ownershipAttested">, value: string) {
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

  function selectExistingLocation(location: OnboardingLocation) {
    setSelectedLocation(location);
    setLocationPathChosen(true);
    setForm((prev) => ({
      ...prev,
      selectedLocationId: location.id,
      locationName: location.name,
      address: location.address || "",
      city: location.city || "",
      state: location.state || "",
      zipCode: location.zipCode || "",
      phone: location.phone || "",
      website: location.website || "",
      locationType:
        location.locationType === "restaurant" ? "Restaurant" : "Activity",
    }));
  }

  function chooseNewLocation() {
    setSelectedLocation(null);
    setLocationPathChosen(true);
    setForm((prev) => ({
      ...prev,
      selectedLocationId: "",
      locationName: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      phone: "",
      website: "",
      locationType: "",
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
    if (!signedIn) {
      setError("Create or sign in to your business account before submitting this request.");
      return;
    }
    if (!emailVerified) {
      setError("Verify your account email before submitting this request.");
      return;
    }
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
        const errorMessages: Record<string, string> = {
          captcha_failed: "Security verification could not be completed. Please try again.",
          auth_required: "Please sign in to your business account and try again.",
          email_must_match_account: "Use the email address connected to your signed-in account.",
          email_verification_required: "Verify your account email before submitting this request.",
          active_claim_limit: "Your account already has an open location claim. Finish that review before submitting another.",
          claim_rate_limited: "Too many claim attempts were submitted. Please wait and try again later.",
          ownership_evidence_required: "Confirm that you’re authorized to manage this business.",
          location_already_claimed: "This location has already been claimed. Contact support if ownership has changed.",
          location_not_found: "That listing is no longer available. Search again or add a new location.",
        };
        setError(
          errorMessages[data.error] ||
            "Could not submit your request. Check the required fields and try again.",
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
                  Partner onboarding
                </p>
                <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight sm:text-5xl">
                  Find or add your business
                </h1>
                <div className="mt-6 text-base leading-8 text-white/62 sm:text-lg">
                  <p>
                    Search our live directory first. Claim an existing listing, or add a new location for review without creating a duplicate.
                  </p>
                </div>
              </div>

              <form
                onSubmit={submit}
                className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/40 sm:p-6"
              >
                <BusinessLocationLookup
                  selected={selectedLocation}
                  onSelect={selectExistingLocation}
                  onAddNew={chooseNewLocation}
                />

                {locationPathChosen && canCompleteClaim ? (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
                  <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={form.ownershipAttested}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          ownershipAttested: event.target.checked,
                        }))
                      }
                      required
                      className="mt-1 h-4 w-4 accent-[#e1062a]"
                    />
                    <span className="text-sm font-semibold leading-6 text-white/65">
                      I confirm that I’m authorized to manage this business and that the information I submitted is accurate.
                    </span>
                  </label>
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
                      <option value="pro">Partner Pro</option>
                      <option value="free_discovery">Free Discovery</option>
                    </select>
                  </label>
                  {form.planInterest === "pro" ? (
                    <label className="block">
                      <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                        Billing option
                      </span>
                      <select
                        value={form.planInterval}
                        onChange={(event) => update("planInterval", event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0d0d0d] px-4 py-4 text-sm font-bold text-white outline-none focus:border-[#e1062a]"
                      >
                        <option value="monthly">$99 monthly</option>
                        <option value="annual">$999 annually — save $189</option>
                      </select>
                    </label>
                  ) : null}
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
                ) : null}

                {turnstileSiteKey && locationPathChosen && canCompleteClaim ? (
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

                {locationPathChosen ? (
                  canCompleteClaim ? (
                    <button
                      type="submit"
                      disabled={submitting}
                      className="mt-5 w-full rounded-2xl bg-[#e1062a] px-6 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/25 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? "Submitting…" : selectedLocation ? "Request Access to This Location" : "Submit New Location for Review"}
                    </button>
                  ) : signedIn && authChecked ? (
                    <div className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4">
                      <p className="text-sm font-black text-amber-100">
                        Verify your email before submitting
                      </p>
                      <p className="mt-1 text-xs leading-5 text-white/55">
                        Open the verification email sent to {accountEmail || "your account email"}, then return here.
                      </p>
                      <Link
                        href={`/signup/check-email?email=${encodeURIComponent(accountEmail)}`}
                        className="mt-3 inline-flex text-sm font-black text-amber-100 underline underline-offset-4"
                      >
                        Verification help
                      </Link>
                    </div>
                  ) : authChecked ? (
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <Link
                        href={`/signup?next=${encodeURIComponent(claimReturnPath)}`}
                        className="rounded-2xl bg-[#e1062a] px-6 py-4 text-center text-sm font-black text-white"
                      >
                        Create Business Account
                      </Link>
                      <Link
                        href={`/login?next=${encodeURIComponent(claimReturnPath)}`}
                        className="rounded-2xl border border-white/15 px-6 py-4 text-center text-sm font-black text-white"
                      >
                        Sign In
                      </Link>
                    </div>
                  ) : null
                ) : null}
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
