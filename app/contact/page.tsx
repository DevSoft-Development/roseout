"use client";

import { useEffect, useRef, useState } from "react";

type FormState = {
  name: string;
  email: string;
  phone: string;
  smsConsent: boolean;
  topic: string;
  message: string;
};

const initialForm: FormState = {
  name: "",
  email: "",
  phone: "",
  smsConsent: false,
  topic: "General Support",
  message: "",
};

const contactChannels = [
  {
    title: "Support by text",
    number: "(516) 200-0801",
    href: "sms:+15162000801",
    note: "Text-only support line",
  },
  {
    title: "Reservations by text",
    number: "(516) 200-0601",
    href: "sms:+15162000601",
    note: "Text-only reservations line",
  },
  {
    title: "Sales",
    number: "Call (516) 200-0811",
    href: "tel:+15162000811",
    note: "Sales calls only",
    secondaryNumber: "Text (516) 200-0701",
    secondaryHref: "sms:+15162000701",
  },
];

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => void;
  reset: (element: HTMLElement) => void;
};

export default function ContactPage() {
  const turnstileRef = useRef<HTMLDivElement | null>(null);

  const [form, setForm] = useState<FormState>(initialForm);
  const [captchaToken, setCaptchaToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaReady, setCaptchaReady] = useState(false);
  const [success, setSuccess] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const [error, setError] = useState("");

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const updateField = (field: keyof FormState, value: string | boolean) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  useEffect(() => {
    if (!siteKey) return;

    const existingScript = document.querySelector(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
    );

    const renderTurnstile = () => {
      const turnstile = window.turnstile as TurnstileApi | undefined;
      if (!turnstile || !turnstileRef.current || captchaReady) return;

      turnstile.render(turnstileRef.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: (token: string) => {
          setCaptchaToken(token);
        },
        "expired-callback": () => {
          setCaptchaToken("");
        },
        "error-callback": () => {
          setCaptchaToken("");
          setError("Captcha failed to load. Please refresh and try again.");
        },
      });

      setCaptchaReady(true);
    };

    if (existingScript) {
      renderTurnstile();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.onload = renderTurnstile;

    document.body.appendChild(script);
  }, [siteKey, captchaReady]);

  const submitContact = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (loading) return;

    setError("");
    setSuccess("");
    setTicketUrl("");

    if (!form.name.trim()) {
      setError("Please enter your name.");
      return;
    }

    if (!form.email.trim() && !form.phone.trim()) {
      setError("Please enter an email address, mobile number, or both.");
      return;
    }

    if (form.phone.trim() && !form.email.trim() && !form.smsConsent) {
      setError("Please agree to the text terms so we can confirm a phone-only submission by text.");
      return;
    }

    if (!form.message.trim()) {
      setError("Please enter your message.");
      return;
    }

    if (!captchaToken) {
      setError("Please complete the captcha.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          captchaToken,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }

      setSuccess(data.message || "Support ticket created.");
      setTicketUrl(data.ticketUrl || "");
      setForm(initialForm);
      setCaptchaToken("");

      const turnstile = window.turnstile as TurnstileApi | undefined;
      if (turnstile && turnstileRef.current) {
        turnstile.reset(turnstileRef.current);
      }
    } catch {
      setError("Could not send message. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="relative overflow-hidden px-6 pt-32 pb-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(225,6,42,0.2),transparent_35%),linear-gradient(180deg,#050505,#000)]" />

        <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">
              Contact TheOutHaven
            </p>

            <h1 className="mt-5 text-5xl font-black leading-tight md:text-6xl">
              Need help or want to work with us?
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/60">
              Send us a message for support, partnerships, business listings,
              corrections, or general TheOutHaven questions.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <InfoBox title="Support" text="Questions about using TheOutHaven." />
              <InfoBox
                title="Business Listings"
                text="Claim, add, or update a location."
              />
              <InfoBox
                title="Partnerships"
                text="Explore business opportunities."
              />
              <InfoBox
                title="Corrections"
                text="Report outdated or incorrect listing details."
              />
            </div>

            <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-[#e1062a]">
                Call or text us
              </p>
              <h2 className="mt-3 text-2xl font-black">Choose the right line</h2>
              <p className="mt-2 text-sm leading-6 text-white/50">
                Support and reservations are available by text. Our voice line is reserved for sales calls only.
              </p>

              <div className="mt-5 grid gap-3">
                {contactChannels.map((channel) => (
                  <div
                    key={channel.title}
                    className="rounded-2xl border border-white/10 bg-black/50 p-4"
                  >
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                      {channel.title}
                    </p>
                    <a
                      href={channel.href}
                      className="mt-2 inline-flex text-lg font-black text-white transition hover:text-[#e1062a]"
                    >
                      {channel.number}
                    </a>
                    {channel.secondaryNumber && channel.secondaryHref ? (
                      <a
                        href={channel.secondaryHref}
                        className="mt-1 block text-base font-black text-white transition hover:text-[#e1062a]"
                      >
                        {channel.secondaryNumber}
                      </a>
                    ) : null}
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-white/35">
                      {channel.note}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[#0d0d0d] p-6 shadow-2xl shadow-black/40">
            <h2 className="text-2xl font-black">Send a message</h2>

            <p className="mt-2 text-sm leading-6 text-white/45">
              Complete the form below and our team will review your message. A support ticket is created automatically, and we will confirm by email, text, or both based on the contact information and consent you provide.
            </p>

            {success && (
              <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-200">
                <p>{success}</p>
                {ticketUrl && (
                  <a href={ticketUrl} className="mt-2 inline-flex underline">
                    View or reply to your ticket
                  </a>
                )}
              </div>
            )}

            {error && (
              <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
                {error}
              </div>
            )}

            <form onSubmit={submitContact} className="mt-6 space-y-4">
              <Field
                label="Name"
                placeholder="Your name"
                value={form.name}
                onChange={(value) => updateField("name", value)}
                required
              />

              <Field
                label="Email"
                placeholder="name@example.com"
                value={form.email}
                onChange={(value) => updateField("email", value)}
                type="email"
                hint="Email or mobile is required. You may provide both."
              />

              <Field
                label="Mobile number"
                placeholder="(516) 555-1234"
                value={form.phone}
                onChange={(value) => updateField("phone", value)}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
              />

              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black p-4">
                <input
                  type="checkbox"
                  checked={form.smsConsent}
                  onChange={(e) => updateField("smsConsent", e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#e1062a]"
                />
                <span className="text-xs leading-5 text-white/50">
                  I agree to receive support-related text messages from TheOutHaven at the mobile number provided. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase. See our{" "}
                  <a href="/terms" className="font-bold text-white underline hover:text-[#e1062a]">
                    Terms
                  </a>{" "}
                  and{" "}
                  <a href="/privacy" className="font-bold text-white underline hover:text-[#e1062a]">
                    Privacy Policy
                  </a>.
                </span>
              </label>

              <SelectField
                label="Topic"
                value={form.topic}
                onChange={(value) => updateField("topic", value)}
                options={[
                  "General Support",
                  "Business Listing",
                  "Partnership",
                  "Listing Correction",
                  "Press / Media",
                  "Other",
                ]}
              />

              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                  Message <span className="text-[#e1062a]">*</span>
                </span>

                <textarea
                  rows={6}
                  value={form.message}
                  onChange={(e) => updateField("message", e.target.value)}
                  placeholder="How can we help?"
                  className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-[#e1062a]"
                />
              </label>

              <div className="rounded-2xl border border-white/10 bg-black p-4">
                {siteKey ? (
                  <div ref={turnstileRef} />
                ) : (
                  <p className="text-sm font-bold text-red-200">
                    Missing NEXT_PUBLIC_TURNSTILE_SITE_KEY.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-[#e1062a] px-6 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/25 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Sending..." : "Send Message"}
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
  hint,
  inputMode,
  autoComplete,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  hint?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
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
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-[#e1062a]"
      />
      {hint ? <span className="mt-2 block text-xs text-white/35">{hint}</span> : null}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
        {label}
      </span>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm font-bold text-white outline-none focus:border-[#e1062a]"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
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
