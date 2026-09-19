"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import GoogleAddressAutocomplete, {
  type GoogleAddressFields,
} from "@/components/GoogleAddressAutocomplete";
import {
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  Bot,
  Building2,
  CalendarCheck,
  Check,
  Crown,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  QrCode,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";

const proBenefits = [
  "Priority AI discovery in customer outing plans",
  "TheOutHaven Reserve booking tools",
  "Advanced analytics dashboard",
  "QR Growth Tools for in-restaurant traffic",
  "Up to 10 photos and full listing customization",
  "Menu, website, phone, and social media links",
];

const trustPoints = [
  "Secure checkout powered by Stripe",
  "Cancel anytime",
  "Monthly subscription",
  "Built for restaurants, lounges, bars, and experience venues",
];

export default function CheckoutInfoPage() {
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const hasRenderedTurnstile = useRef(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const passwordChecks = useMemo(
    () => [
      { label: "At least 8 characters", valid: password.length >= 8 },
      { label: "One uppercase letter", valid: /[A-Z]/.test(password) },
      { label: "One lowercase letter", valid: /[a-z]/.test(password) },
      { label: "One number", valid: /[0-9]/.test(password) },
      {
        label: "One special character",
        valid: /[^A-Za-z0-9]/.test(password),
      },
    ],
    [password]
  );

  const passwordStrength = passwordChecks.filter((check) => check.valid).length;

  const passwordsMatch =
    password.length > 0 &&
    confirmPassword.length > 0 &&
    password === confirmPassword;

  const strengthLabel =
    passwordStrength <= 2 ? "Weak" : passwordStrength === 3 ? "Good" : "Strong";

  const strengthWidth =
    passwordStrength === 0
      ? "0%"
      : passwordStrength === 1
      ? "20%"
      : passwordStrength === 2
      ? "40%"
      : passwordStrength === 3
      ? "65%"
      : passwordStrength === 4
      ? "85%"
      : "100%";

  const strengthColor =
    passwordStrength <= 2
      ? "bg-red-500"
      : passwordStrength === 3
      ? "bg-yellow-400"
      : "bg-green-500";

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

    if (!turnstileReady) return;
    if (!siteKey) return;
    if (!(window as Window & { turnstile?: { render?: (element: HTMLElement, options: { sitekey: string; theme?: string }) => void; reset?: () => void } }).turnstile?.render) return;
    if (!turnstileRef.current) return;
    if (hasRenderedTurnstile.current) return;

    (window as Window & { turnstile?: { render?: (element: HTMLElement, options: { sitekey: string; theme?: string }) => void; reset?: () => void } }).turnstile?.render?.(turnstileRef.current, {
      sitekey: siteKey,
      theme: "dark",
    });

    hasRenderedTurnstile.current = true;
  }, [turnstileReady]);

  return (
    <main className="min-h-screen overflow-hidden bg-[#050505] text-white">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setTurnstileReady(true)}
      />

      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-[-180px] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-rose-700/25 blur-[140px]" />
        <div className="absolute bottom-[-180px] right-[-120px] h-[420px] w-[420px] rounded-full bg-red-900/20 blur-[130px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_38%)]" />
      </div>

      <section className="relative mx-auto max-w-7xl px-5 pt-28 pb-8 sm:px-8 lg:px-10 lg:pt-32 lg:pb-12">
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-zinc-400 backdrop-blur transition hover:border-rose-400/40 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to pricing
          </Link>

          <div className="hidden items-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm text-rose-200 sm:flex">
            <LockKeyhole className="h-4 w-4" />
            Secure pre-checkout
          </div>
        </div>

        <div className="mx-auto mb-10 max-w-3xl text-center">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-rose-200">
            <Sparkles className="h-4 w-4" />
            TheOutHaven Pro Enrollment
          </div>

          <h1 className="text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
            Before checkout,
            <span className="block bg-gradient-to-r from-rose-200 via-rose-500 to-red-500 bg-clip-text text-transparent">
              create your business account.
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
            Enter your business details, select your location address, create a
            secure password, then continue to Stripe checkout.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 shadow-2xl backdrop-blur-xl sm:p-8 lg:p-10">
            <div className="mb-8 flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-300">
                <Building2 className="h-7 w-7" />
              </div>

              <div>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-rose-300">
                  Business Details
                </p>
                <h2 className="mt-2 text-2xl font-black">
                  Set up your TheOutHaven Pro profile
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Choose your location address from Google to improve accuracy
                  and help avoid duplicate listings.
                </p>
              </div>
            </div>

            <form action="/api/checkout" method="POST" className="space-y-5">
              <input type="hidden" name="plan" value="pro" />

              <Field
                icon={Building2}
                label="Restaurant / Business Name"
                name="businessName"
                placeholder="Example: Haven Bistro"
                required
              />

              <GoogleLocationAddressField />

              <Field
                icon={User}
                label="Owner / Contact Name"
                name="contactName"
                placeholder="Full name"
                required
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  icon={Mail}
                  label="Business Email"
                  name="email"
                  type="email"
                  placeholder="owner@restaurant.com"
                  required
                />

                <Field
                  icon={Phone}
                  label="Business Phone"
                  name="phone"
                  type="tel"
                  placeholder="(555) 555-5555"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-zinc-300">
                  Business Type
                </label>

                <select
                  name="businessType"
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-sm text-white outline-none transition focus:border-rose-400/60"
                  defaultValue=""
                  required
                >
                  <option value="" disabled>
                    Select business type
                  </option>
                  <option value="restaurant">Restaurant</option>
                  <option value="bar_lounge">Bar / Lounge</option>
                  <option value="cafe">Cafe</option>
                  <option value="activity_venue">
                    Activity / Experience Venue
                  </option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-zinc-300">
                  What do you want TheOutHaven to help with most?
                </label>

                <textarea
                  name="goal"
                  rows={4}
                  placeholder="Example: More date night bookings, more weekday traffic, more visibility for birthdays..."
                  className="w-full resize-none rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-rose-400/60"
                />
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-black/30 p-5">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-300">
                    <LockKeyhole className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-black">Create a secure password</h3>
                    <p className="text-sm text-zinc-500">
                      This will be used for your TheOutHaven business account.
                    </p>
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <PasswordField
                    label="Password"
                    name="password"
                    value={password}
                    onChange={setPassword}
                    placeholder="Create password"
                  />

                  <PasswordField
                    label="Confirm Password"
                    name="confirmPassword"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="Repeat password"
                  />
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between text-xs font-bold">
                    <span className="text-zinc-400">Password strength</span>
                    <span
                      className={
                        passwordStrength <= 2
                          ? "text-red-400"
                          : passwordStrength === 3
                          ? "text-yellow-300"
                          : "text-green-400"
                      }
                    >
                      {password ? strengthLabel : "Required"}
                    </span>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${strengthColor}`}
                      style={{ width: strengthWidth }}
                    />
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {passwordChecks.map((check) => (
                    <div
                      key={check.label}
                      className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                        check.valid
                          ? "border-green-500/30 bg-green-500/10 text-green-300"
                          : "border-white/10 bg-white/[0.03] text-zinc-500"
                      }`}
                    >
                      {check.valid ? "✓" : "○"} {check.label}
                    </div>
                  ))}

                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                      passwordsMatch
                        ? "border-green-500/30 bg-green-500/10 text-green-300"
                        : "border-white/10 bg-white/[0.03] text-zinc-500"
                    }`}
                  >
                    {passwordsMatch ? "✓" : "○"} Passwords match
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-black/30 p-5">
                <h3 className="mb-3 flex items-center gap-2 font-black">
                  <ShieldCheck className="h-5 w-5 text-rose-300" />
                  Security Check
                </h3>

                <p className="mb-4 text-sm leading-6 text-zinc-500">
                  Complete the captcha before continuing to checkout.
                </p>

                <div ref={turnstileRef} />
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <label className="flex items-start gap-3 text-sm leading-6 text-zinc-400">
                  <input
                    type="checkbox"
                    required
                    className="mt-1 h-4 w-4 rounded border-white/20 bg-black accent-rose-600"
                  />
                  <span>
                    I understand TheOutHaven Pro is a $99/month subscription and I
                    will be redirected to Stripe to complete secure checkout.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                className="group mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-6 py-4 text-sm font-black text-white shadow-[0_0_40px_rgba(225,29,72,0.35)] transition duration-300 hover:-translate-y-1 hover:bg-rose-500"
              >
                Continue to Secure Checkout
                <LockKeyhole className="h-4 w-4 transition group-hover:scale-110" />
              </button>

              <p className="text-center text-xs leading-5 text-zinc-500">
                Your payment is completed on Stripe. TheOutHaven does not store your
                card information.
              </p>
            </form>
          </div>

          <aside className="space-y-5">
            <div className="relative overflow-hidden rounded-[2rem] border border-rose-500/35 bg-gradient-to-b from-rose-950/45 to-white/[0.035] p-6 shadow-[0_0_70px_rgba(225,29,72,0.20)] backdrop-blur-xl sm:p-8">
              <div className="relative">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-xs font-black uppercase tracking-[0.2em]">
                  <Crown className="h-4 w-4" />
                  Most Popular
                </div>

                <h2 className="text-3xl font-black">TheOutHaven Pro</h2>

                <div className="mt-4 flex items-end gap-2">
                  <span className="text-5xl font-black">$99</span>
                  <span className="pb-2 text-sm text-zinc-400">/ month</span>
                </div>

                <p className="mt-5 text-sm leading-7 text-zinc-300">
                  Built for businesses that want priority AI discovery,
                  reservations, analytics, and stronger visibility inside
                  TheOutHaven.
                </p>

                <div className="mt-7 space-y-4">
                  {proBenefits.map((benefit) => (
                    <div key={benefit} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
                      <p className="text-sm leading-6 text-zinc-200">
                        {benefit}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 backdrop-blur-xl sm:p-8">
              <h3 className="flex items-center gap-2 text-lg font-black">
                <ShieldCheck className="h-5 w-5 text-rose-300" />
                What happens next?
              </h3>

              <div className="mt-6 space-y-5">
                <Step number="01" title="Enter business details">
                  Add your business name, location address, owner contact,
                  email, phone, and business type.
                </Step>

                <Step number="02" title="Create account password">
                  Your password must include uppercase, lowercase, number,
                  special character, and at least 8 characters.
                </Step>

                <Step number="03" title="Complete Stripe checkout">
                  Stripe securely processes your TheOutHaven Pro subscription.
                </Step>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <MiniCard
                icon={Bot}
                title="AI Boost"
                text="Higher visibility in AI-generated outing plans."
              />
              <MiniCard
                icon={CalendarCheck}
                title="Reserve"
                text="Give customers a direct booking path."
              />
              <MiniCard
                icon={BarChart3}
                title="Analytics"
                text="Track views, clicks, and booking interest."
              />
              <MiniCard
                icon={QrCode}
                title="QR Tools"
                text="Turn in-person traffic into digital engagement."
              />
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-black/30 p-6">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-zinc-300">
                <BadgeCheck className="h-4 w-4 text-rose-300" />
                Plan Notes
              </h3>

              <div className="space-y-3">
                {trustPoints.map((point) => (
                  <div key={point} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                    <p className="text-sm leading-6 text-zinc-400">{point}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function GoogleLocationAddressField() {
  const [addressFields, setAddressFields] = useState<GoogleAddressFields>({
    address: "",
    city: "",
    state: "",
    zip_code: "",
    neighborhood: "",
    latitude: "",
    longitude: "",
    google_place_id: "",
    formatted_address: "",
  });

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-300">
        <MapPin className="h-4 w-4 text-rose-300" />
        Location Address
      </div>

      <GoogleAddressAutocomplete
        value={addressFields.address}
        address={addressFields.address}
        city={addressFields.city}
        state={addressFields.state}
        zip_code={addressFields.zip_code}
        neighborhood={addressFields.neighborhood}
        latitude={addressFields.latitude}
        longitude={addressFields.longitude}
        google_place_id={addressFields.google_place_id}
        formatted_address={addressFields.formatted_address}
        label="Address"
        placeholder="Start typing the location address..."
        required
        onAddressChange={(value) =>
          setAddressFields((prev) => ({
            ...prev,
            address: value,
            google_place_id: "",
            formatted_address: "",
            latitude: "",
            longitude: "",
          }))
        }
        onAddressSelect={(selected) =>
          setAddressFields((prev) => ({ ...prev, ...selected }))
        }
        inputClassName="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-rose-400/60"
        labelClassName="sr-only"
        statusClassName="mt-2 text-xs font-semibold text-zinc-500"
        dropdownClassName="absolute z-[999999] mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] shadow-2xl shadow-black/60"
        predictionButtonClassName="block w-full border-b border-white/10 px-4 py-3 text-left text-sm font-bold text-white/75 transition last:border-b-0 hover:bg-white/10"
        hiddenInputNames={{
          address: "address",
          neighborhood: "neighborhood",
          latitude: "latitude",
          longitude: "longitude",
          google_place_id: "google_place_id",
          formatted_address: "formatted_address",
        }}
      />

      <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_0.45fr_0.55fr]">
        <LocationTextField
          label="City"
          name="city"
          value={addressFields.city}
          onChange={(value) =>
            setAddressFields((prev) => ({ ...prev, city: value }))
          }
          placeholder="City"
          required
        />

        <LocationTextField
          label="State"
          name="state"
          value={addressFields.state}
          onChange={(value) =>
            setAddressFields((prev) => ({ ...prev, state: value }))
          }
          placeholder="State"
          required
        />

        <LocationTextField
          label="Zip Code"
          name="zip_code"
          value={addressFields.zip_code}
          onChange={(value) =>
            setAddressFields((prev) => ({ ...prev, zip_code: value }))
          }
          placeholder="Zip Code"
          inputMode="numeric"
          autoComplete="postal-code"
          required
        />
      </div>
    </div>
  );
}

function LocationTextField({
  label,
  name,
  value,
  onChange,
  placeholder,
  required = false,
  maxLength,
  inputMode,
  autoComplete,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-zinc-300">
        {label}
      </label>

      <input
        type="text"
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete={autoComplete}
        className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-rose-400/60"
      />
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  name,
  placeholder,
  type = "text",
  required = false,
}: {
  icon: React.ElementType;
  label: string;
  name: string;
  placeholder: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-zinc-300">
        {label}
      </label>

      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-4 transition focus-within:border-rose-400/60">
        <Icon className="h-5 w-5 shrink-0 text-rose-300" />
        <input
          type={type}
          name={name}
          required={required}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
        />
      </div>
    </div>
  );
}

function PasswordField({
  label,
  name,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-zinc-300">
        {label}
      </label>

      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-4 transition focus-within:border-rose-400/60">
        <LockKeyhole className="h-5 w-5 shrink-0 text-rose-300" />
        <input
          type="password"
          name={name}
          required
          minLength={8}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
        />
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-400/30 bg-rose-500/10 text-xs font-black text-rose-200">
        {number}
      </div>

      <div>
        <h4 className="font-bold text-white">{title}</h4>
        <p className="mt-1 text-sm leading-6 text-zinc-400">{children}</p>
      </div>
    </div>
  );
}

function MiniCard({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ElementType;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-rose-500/30 hover:bg-white/[0.06]">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-300">
        <Icon className="h-5 w-5" />
      </div>

      <h3 className="font-black">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{text}</p>
    </div>
  );
}