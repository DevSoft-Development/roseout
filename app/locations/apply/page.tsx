"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

declare global {
  interface Window {
    turnstile?: any;
    onTheOutHavenTurnstileSuccess?: (token: string) => void;
    onTheOutHavenTurnstileExpired?: () => void;
  }
}

type FormState = {
  location_name: string;
  location_type: string;
  request_type: string;
  website: string;
  address: string;
  city: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  notes: string;
};

const initialForm: FormState = {
  location_name: "",
  location_type: "Restaurant",
  request_type: "Claim existing listing",
  website: "",
  address: "",
  city: "",
  owner_name: "",
  owner_email: "",
  owner_phone: "",
  notes: "",
};

export default function LocationApplyPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerActiveRef = useRef(false);

  const [form, setForm] = useState<FormState>(initialForm);
  const [captchaToken, setCaptchaToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState("");

  useEffect(() => {
    document.title = "Claim or Add Your Location | TheOutHaven";

    window.onTheOutHavenTurnstileSuccess = (token: string) => {
      setCaptchaToken(token);
    };

    window.onTheOutHavenTurnstileExpired = () => {
      setCaptchaToken("");
    };

    return () => {
      delete window.onTheOutHavenTurnstileSuccess;
      delete window.onTheOutHavenTurnstileExpired;
    };
  }, []);

  const updateField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const resetCaptcha = () => {
    setCaptchaToken("");

    if (window.turnstile) {
      window.turnstile.reset();
    }
  };

  const closeQrScanner = () => {
    scannerActiveRef.current = false;
    setScannerOpen(false);

    const stream = videoRef.current?.srcObject as MediaStream | null;

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const openQrScanner = async () => {
    setScanError("");
    setScannerOpen(true);
    scannerActiveRef.current = true;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setScanError("Camera scanning is not supported on this device.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const BarcodeDetectorClass = (window as any).BarcodeDetector;

      if (!BarcodeDetectorClass) {
        setScanError(
          "QR scanning is not supported in this browser. Please scan with your phone camera or open the QR link manually."
        );
        return;
      }

      const detector = new BarcodeDetectorClass({
        formats: ["qr_code"],
      });

      const scan = async () => {
        if (!scannerActiveRef.current || !videoRef.current) return;

        try {
          const codes = await detector.detect(videoRef.current);

          if (codes.length > 0) {
            const url = String(codes[0].rawValue || "");

            if (
              url.includes("theouthaven.com") ||
              url.includes("theouthaven.vercel.app")
            ) {
              closeQrScanner();
              window.location.href = url;
              return;
            }

            setScanError("This QR code is not a TheOutHaven claim link.");
            return;
          }
        } catch {
          setScanError("Could not read the QR code. Please try again.");
          return;
        }

        requestAnimationFrame(scan);
      };

      requestAnimationFrame(scan);
    } catch {
      setScanError("Camera access was denied or unavailable.");
    }
  };

  const submitRequest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (loading) return;

    setError("");
    setSuccess("");

    if (!form.location_name.trim()) {
      setError("Please enter your business / location name.");
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
        resetCaptcha();
        return;
      }

      setSuccess(
        data.message || "Request submitted. We’ll review and follow up shortly."
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

      <section className="relative overflow-hidden px-6 pt-32 pb-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(225,6,42,0.2),transparent_35%),linear-gradient(180deg,#050505,#000)]" />

        <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">
              Claim or Add Location
            </p>

            <h1 className="mt-5 text-5xl font-black leading-tight md:text-6xl">
              Manage how your location appears on TheOutHaven.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/60">
              This page is for restaurants, activities, lounges, venues, and
              experience-based businesses that want to claim or submit a
              location on TheOutHaven.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <InfoBox
                title="Claim"
                text="Already listed? Start the claim process."
              />
              <InfoBox
                title="Submit"
                text="Not listed yet? Submit your location for review."
              />
              <InfoBox
                title="Improve"
                text="Update details, links, photos, and tags after approval."
              />
              <InfoBox
                title="Track"
                text="Understand views, clicks, and customer interest."
              />
            </div>

            <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-xl font-black">
                Already received a QR code?
              </h2>

              <p className="mt-3 text-sm leading-7 text-white/50">
                Open your camera to scan your TheOutHaven claim QR code. If the code
                is valid, you’ll be taken directly to your claim page.
              </p>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={openQrScanner}
                  className="rounded-2xl bg-[#e1062a] px-5 py-3 text-sm font-black text-white transition hover:bg-red-500"
                >
                  Scan QR Code
                </button>

                <Link
                  href="/business"
                  className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-center text-sm font-black text-white/70 transition hover:bg-white hover:text-black"
                >
                  Back to For Businesses
                </Link>
              </div>

              {scannerOpen && (
                <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-black p-4">
                  <video
                    ref={videoRef}
                    className="h-72 w-full rounded-2xl bg-black object-cover"
                    playsInline
                    muted
                  />

                  <button
                    type="button"
                    onClick={closeQrScanner}
                    className="mt-4 w-full rounded-2xl border border-white/15 px-5 py-3 text-sm font-black text-white/70 transition hover:bg-white hover:text-black"
                  >
                    Close Camera
                  </button>
                </div>
              )}

              {scanError && (
                <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
                  {scanError}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[#0d0d0d] p-6 shadow-2xl shadow-black/40">
            <h2 className="text-2xl font-black">Location request</h2>

            <p className="mt-2 text-sm leading-6 text-white/45">
              Submit your request to claim or add your location. Our team will
              review and follow up if needed.
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

            <form onSubmit={submitRequest} className="mt-6 space-y-4">
              <Field
                label="Business / Location Name"
                placeholder="Example: Rose Lounge"
                value={form.location_name}
                onChange={(value) => updateField("location_name", value)}
                required
              />

              <SelectField
                label="Location Type"
                value={form.location_type}
                onChange={(value) => updateField("location_type", value)}
                options={[
                  "Restaurant",
                  "Activity",
                  "Lounge / Nightlife",
                  "Venue",
                  "Other Experience",
                ]}
              />

              <Field
                label="Business Website"
                placeholder="https://example.com"
                value={form.website}
                onChange={(value) => updateField("website", value)}
              />

              <Field
                label="Address"
                placeholder="Street address"
                value={form.address}
                onChange={(value) => updateField("address", value)}
              />

              <Field
                label="City"
                placeholder="New York"
                value={form.city}
                onChange={(value) => updateField("city", value)}
              />

              <Field
                label="Owner / Manager Name"
                placeholder="Full name"
                value={form.owner_name}
                onChange={(value) => updateField("owner_name", value)}
                required
              />

              <Field
                label="Email"
                placeholder="name@example.com"
                value={form.owner_email}
                onChange={(value) => updateField("owner_email", value)}
                required
                type="email"
              />

              <Field
                label="Phone"
                placeholder="Phone number"
                value={form.owner_phone}
                onChange={(value) => updateField("owner_phone", value)}
                type="tel"
              />

              <SelectField
                label="Request Type"
                value={form.request_type}
                onChange={(value) => updateField("request_type", value)}
                options={[
                  "Claim existing listing",
                  "Add new location",
                  "Update listing details",
                ]}
              />

              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                  Notes
                </span>

                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                  placeholder="Tell us anything helpful about this location."
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
                  data-callback="onTheOutHavenTurnstileSuccess"
                  data-expired-callback="onTheOutHavenTurnstileExpired"
                  data-theme="dark"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-[#e1062a] px-6 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/25 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Submitting..." : "Submit Request"}
              </button>

              <p className="text-center text-xs leading-5 text-white/35">
                Submissions may be reviewed before approval. This form does not
                guarantee immediate listing access.
              </p>
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
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
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