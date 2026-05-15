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

type RequestType = "claim" | "add";

type AddressPrediction = {
  place_id: string;
  description: string;
};

type FormState = {
  location_name: string;
  location_type: string;
  request_type: string;
  website: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  notes: string;
};

const getInitialForm = (requestType: RequestType): FormState => ({
  location_name: "",
  location_type: "Restaurant",
  request_type:
    requestType === "claim" ? "Claim existing listing" : "Add new location",
  website: "",
  address: "",
  city: "",
  state: "",
  zip_code: "",
  owner_name: "",
  owner_email: "",
  owner_phone: "",
  notes: "",
});

export default function LocationApplyPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerActiveRef = useRef(false);
  const addressInputRef = useRef<HTMLInputElement | null>(null);

  const [requestType, setRequestType] = useState<RequestType>("claim");
  const [form, setForm] = useState<FormState>(getInitialForm("claim"));
  const [captchaToken, setCaptchaToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState("");
  const [addressPredictions, setAddressPredictions] = useState<
    AddressPrediction[]
  >([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressStatus, setAddressStatus] = useState("");

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

  const chooseRequestType = (type: RequestType) => {
    setRequestType(type);
    setForm((prev) => ({
      ...prev,
      request_type:
        type === "claim" ? "Claim existing listing" : "Add new location",
    }));
    setError("");
    setSuccess("");
  };

  const updateField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleAddressChange = async (value: string) => {
    updateField("address", value);
    setAddressStatus("");

    if (value.trim().length < 2) {
      setAddressPredictions([]);
      setAddressLoading(false);
      return;
    }

    setAddressLoading(true);

    try {
      const res = await fetch("/api/google/address-autocomplete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: value }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAddressPredictions([]);
        setAddressStatus(data.error || "Google address lookup failed.");
        return;
      }

      setAddressPredictions(data.predictions || []);

      if (!data.predictions?.length) {
        setAddressStatus("No address matches found. Try typing more details.");
      }
    } catch {
      setAddressPredictions([]);
      setAddressStatus("Google address lookup failed.");
    } finally {
      setAddressLoading(false);
    }
  };

  const selectAddressPrediction = async (prediction: AddressPrediction) => {
    setAddressPredictions([]);
    setAddressLoading(true);
    setAddressStatus("");

    try {
      const res = await fetch("/api/google/address-details", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ placeId: prediction.place_id }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAddressStatus(data.error || "Could not read selected address.");
        return;
      }

      setForm((prev) => ({
        ...prev,
        address: data.address || prediction.description || prev.address,
        city: data.city || prev.city,
        state: data.state || prev.state,
        zip_code: data.zip_code || prev.zip_code,
      }));
    } catch {
      setAddressStatus("Could not read selected address.");
    } finally {
      setAddressLoading(false);
    }
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          plan: "free",
          flow: requestType,
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
        data.message ||
          (requestType === "claim"
            ? "Claim request submitted. We’ll review and follow up shortly."
            : "New location submitted. We’ll review it before publishing.")
      );

      setForm(getInitialForm(requestType));
      setAddressPredictions([]);
      setAddressStatus("");
      resetCaptcha();
    } catch {
      setError("Could not submit request. Please try again.");
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const isClaim = requestType === "claim";

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
              Free Business Listing
            </p>

            <h1 className="mt-5 text-5xl font-black leading-tight md:text-6xl">
              Claim your listing or add a new location.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/60">
              Choose the correct free plan flow below. Claim is for businesses
              already listed on TheOutHaven. Add New Location is for businesses
              that are not listed yet.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => chooseRequestType("claim")}
                className={`rounded-[2rem] border p-6 text-left transition ${
                  isClaim
                    ? "border-[#e1062a] bg-[#e1062a]/15 shadow-2xl shadow-red-500/20"
                    : "border-white/10 bg-white/[0.04] hover:border-white/25"
                }`}
              >
                <p className="text-xs font-black uppercase tracking-[0.25em] text-[#e1062a]">
                  Option 1
                </p>

                <h2 className="mt-3 text-2xl font-black">
                  Claim Existing Location
                </h2>

                <p className="mt-3 text-sm leading-7 text-white/55">
                  Choose this if your restaurant, lounge, activity, venue, or
                  business already appears on TheOutHaven.
                </p>
              </button>

              <button
                type="button"
                onClick={() => chooseRequestType("add")}
                className={`rounded-[2rem] border p-6 text-left transition ${
                  !isClaim
                    ? "border-[#e1062a] bg-[#e1062a]/15 shadow-2xl shadow-red-500/20"
                    : "border-white/10 bg-white/[0.04] hover:border-white/25"
                }`}
              >
                <p className="text-xs font-black uppercase tracking-[0.25em] text-[#e1062a]">
                  Option 2
                </p>

                <h2 className="mt-3 text-2xl font-black">Add New Location</h2>

                <p className="mt-3 text-sm leading-7 text-white/55">
                  Choose this if your business is not listed yet and you want to
                  submit it for review.
                </p>
              </button>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <InfoBox
                title="Free Claim"
                text="Verify ownership and request access to manage an existing listing."
              />
              <InfoBox
                title="Free Submission"
                text="Submit a new business location for approval before it appears publicly."
              />
              <InfoBox
                title="Google Address"
                text="Search and select an address to auto-fill city, state, and zip code."
              />
              <InfoBox
                title="Upgrade Later"
                text="Move to Pro when you want reservations, analytics, QR tools, and priority discovery."
              />
            </div>

            {isClaim && (
              <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
                <h2 className="text-xl font-black">
                  Already received a QR code?
                </h2>

                <p className="mt-3 text-sm leading-7 text-white/50">
                  Open your camera to scan your TheOutHaven claim QR code. If the
                  code is valid, you’ll be taken directly to your claim page.
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
            )}
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[#0d0d0d] p-6 shadow-2xl shadow-black/40">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              {isClaim ? "Claim Existing Location" : "Add New Location"}
            </p>

            <h2 className="mt-3 text-2xl font-black">
              {isClaim ? "Submit a claim request" : "Submit a new location"}
            </h2>

            <p className="mt-2 text-sm leading-6 text-white/45">
              {isClaim
                ? "Use this form to request access to an existing TheOutHaven listing."
                : "Use this form to submit a new business location for review."}
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
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => chooseRequestType("claim")}
                  className={`rounded-2xl border px-4 py-4 text-sm font-black transition ${
                    isClaim
                      ? "border-[#e1062a] bg-[#e1062a] text-white"
                      : "border-white/10 bg-black text-white/55 hover:text-white"
                  }`}
                >
                  Claim Existing
                </button>

                <button
                  type="button"
                  onClick={() => chooseRequestType("add")}
                  className={`rounded-2xl border px-4 py-4 text-sm font-black transition ${
                    !isClaim
                      ? "border-[#e1062a] bg-[#e1062a] text-white"
                      : "border-white/10 bg-black text-white/55 hover:text-white"
                  }`}
                >
                  Add New Location
                </button>
              </div>

              <Field
                label="Business / Location Name"
                placeholder={
                  isClaim ? "Existing listing name" : "New business name"
                }
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

              <AddressField
                inputRef={addressInputRef}
                label="Google Address"
                placeholder="Start typing and select the business address"
                value={form.address}
                onChange={handleAddressChange}
                predictions={addressPredictions}
                onSelectPrediction={selectAddressPrediction}
                loading={addressLoading}
                required
                status={addressStatus}
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

              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                  Notes
                </span>

                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                  placeholder={
                    isClaim
                      ? "Tell us how you are connected to this business."
                      : "Tell us anything helpful about this new location."
                  }
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
                {loading
                  ? "Submitting..."
                  : isClaim
                    ? "Submit Claim Request"
                    : "Submit New Location"}
              </button>

              <p className="text-center text-xs leading-5 text-white/35">
                Free submissions may be reviewed before approval. Pro features
                such as reservations, dashboard tools, analytics, and QR growth
                tools require an upgraded plan.
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

function AddressField({
  inputRef,
  label,
  placeholder,
  value,
  onChange,
  required,
  predictions,
  onSelectPrediction,
  loading,
  status,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  predictions: AddressPrediction[];
  onSelectPrediction: (prediction: AddressPrediction) => void;
  loading: boolean;
  status: string;
}) {
  return (
    <div className="relative">
      <label className="block">
        <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
          {label}
          {required ? <span className="text-[#e1062a]"> *</span> : null}
        </span>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-[#e1062a]"
        />
      </label>

      {predictions.length > 0 && (
        <div className="absolute z-[999999] mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] shadow-2xl shadow-black/60">
          {predictions.map((prediction) => (
            <button
              key={prediction.place_id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelectPrediction(prediction);
              }}
              className="block w-full border-b border-white/10 px-4 py-3 text-left text-sm font-bold text-white/75 transition last:border-b-0 hover:bg-white/10"
            >
              {prediction.description}
            </button>
          ))}
        </div>
      )}

      <p className="mt-2 text-xs font-semibold text-white/35">
        {loading
          ? "Searching Google addresses..."
          : "Start typing, then select an address from the list."}
      </p>

      {status && (
        <p className="mt-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-200">
          {status}
        </p>
      )}
    </div>
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