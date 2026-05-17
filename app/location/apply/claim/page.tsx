"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

declare global {
  interface Window {
    turnstile?: { render?: (element: HTMLElement, options: { sitekey: string; theme?: string }) => void; reset?: () => void };
    onTheOutHavenClaimTurnstileSuccess?: (token: string) => void;
    onTheOutHavenClaimTurnstileExpired?: () => void;
  }
}

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};

type LocationSearchResult = {
  id: string;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  location_type?: string | null;
  primary_category?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  main_image?: string | null;
  image_url?: string | null;
};

type ClaimFormState = {
  location_name: string;
  location_type: string;
  request_type: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  notes: string;
};

const initialForm: ClaimFormState = {
  location_name: "",
  location_type: "Location",
  request_type: "Claim existing listing",
  address: "",
  city: "",
  state: "",
  zip_code: "",
  owner_name: "",
  owner_email: "",
  owner_phone: "",
  notes: "",
};

function getLocationDisplayName(location: LocationSearchResult) {
  return (
    location.name ||
    location.restaurant_name ||
    location.activity_name ||
    "Unnamed location"
  );
}

function getLocationAddress(location: LocationSearchResult) {
  return [location.address, location.city, location.state, location.zip_code]
    .filter(Boolean)
    .join(", ");
}

export default function ClaimLocationPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerActiveRef = useRef(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [selectedLocation, setSelectedLocation] =
    useState<LocationSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState(
    "Search by business name, city, state, or address."
  );
  const [form, setForm] = useState<ClaimFormState>(initialForm);
  const [captchaToken, setCaptchaToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState("");
  const [claimCode, setClaimCode] = useState("");
  const [claimAccess, setClaimAccess] = useState<{ mode: "token" | "code"; value: string } | null>(null);
  const [validatingClaim, setValidatingClaim] = useState(false);

  useEffect(() => {
    document.title = "Claim Existing Location | TheOutHaven";

    window.onTheOutHavenClaimTurnstileSuccess = (token: string) => {
      setCaptchaToken(token);
    };

    window.onTheOutHavenClaimTurnstileExpired = () => {
      setCaptchaToken("");
    };

    return () => {
      delete window.onTheOutHavenClaimTurnstileSuccess;
      delete window.onTheOutHavenClaimTurnstileExpired;
    };
  }, []);

  const loadClaimAccess = async (params: { token?: string; code?: string }) => {
    setValidatingClaim(true);
    setError("");
    setSuccess("");

    try {
      const searchParams = new URLSearchParams();
      if (params.token) searchParams.set("token", params.token);
      if (params.code) searchParams.set("code", params.code);

      const res = await fetch(`/api/locations/claim/lookup?${searchParams.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setClaimAccess(null);
        setError(data.error || "Invalid claim QR code or claim code.");
        return;
      }

      selectLocation(data.location);
      setClaimAccess(data.claimAccess);
      setSearchMessage("Claim code verified. Complete owner/contact info to submit for admin review.");
    } catch {
      setClaimAccess(null);
      setError("Could not validate claim access. Please try again.");
    } finally {
      setValidatingClaim(false);
    }
  };

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) loadClaimAccess({ token });
    // This should only run once on first load so a scanned QR token can unlock the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      setResults([]);
      setSearchMessage("Search by business name, city, state, or address.");
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      setSearchMessage("Searching locations...");

      try {
        const res = await fetch(
          `/api/locations/apply?query=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal }
        );
        const data = await res.json();

        if (!res.ok) {
          setResults([]);
          setSearchMessage(data.error || "Could not search locations.");
          return;
        }

        const nextResults = Array.isArray(data.locations) ? data.locations : [];
        setResults(nextResults);
        setSearchMessage(
          nextResults.length
            ? "Search results are view-only. Use the QR code or claim code at the location to claim."
            : "No matches found. Try another search or add a new location."
        );
      } catch (searchError) {
        if ((searchError as Error).name !== "AbortError") {
          setResults([]);
          setSearchMessage("Could not search locations. Please try again.");
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query]);

  const updateField = (field: keyof ClaimFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const selectLocation = (location: LocationSearchResult) => {
    setSelectedLocation(location);
    setForm((prev) => ({
      ...prev,
      location_name: getLocationDisplayName(location),
      location_type: location.location_type || "Location",
      address: location.address || "",
      city: location.city || "",
      state: location.state || "",
      zip_code: location.zip_code || "",
    }));
    setSuccess("");
    setError("");
  };

  const resetCaptcha = () => {
    setCaptchaToken("");
    window.turnstile?.reset?.();
  };

  const closeQrScanner = () => {
    scannerActiveRef.current = false;
    setScannerOpen(false);

    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());

    if (videoRef.current) videoRef.current.srcObject = null;
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

      const BarcodeDetectorClass = (
        window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }
      ).BarcodeDetector;

      if (!BarcodeDetectorClass) {
        setScanError(
          "QR scanning is not supported in this browser. Please scan with your phone camera or open the QR link manually."
        );
        return;
      }

      const detector = new BarcodeDetectorClass({ formats: ["qr_code"] });

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

  const submitClaim = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setError("");
    setSuccess("");

    if (!selectedLocation) {
      setError("Please validate the QR code or claim code for the location you want to claim.");
      return;
    }

    if (!claimAccess) {
      setError("To protect businesses, claiming requires the QR code or claim code provided by the location.");
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
          notes: [
            selectedLocation.id ? `Location ID: ${selectedLocation.id}` : "",
            form.notes,
          ]
            .filter(Boolean)
            .join("\n\n"),
          plan: "free",
          flow: "claim",
          captchaToken,
          claim_token: claimAccess.mode === "token" ? claimAccess.value : "",
          claim_code: claimAccess.mode === "code" ? claimAccess.value : "",
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        resetCaptcha();
        return;
      }

      setSuccess(
        "Your claim request has been submitted. Our team will review it shortly."
      );
      setForm(initialForm);
      setSelectedLocation(null);
      setClaimAccess(null);
      setQuery("");
      setResults([]);
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

        <div className="relative mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div>
            <Link
              href="/location/apply"
              className="text-sm font-black text-white/45 transition hover:text-white"
            >
              ← Back to options
            </Link>
            <p className="mt-8 text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">
              Claim Existing Location
            </p>
            <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight sm:text-5xl md:text-6xl">
              Request access to manage your listing.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-white/60 sm:text-lg">
              Search the unified TheOutHaven locations table, select your
              business, and send your ownership details to our team.
            </p>

            <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-xl font-black">Search existing locations</h2>
              <label className="mt-5 block">
                <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                  Search
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Business name, city, state, or address"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-[#e1062a]"
                />
              </label>
              <p className="mt-3 text-xs font-bold text-white/40">
                {searching ? "Searching locations..." : searchMessage}
              </p>


              <div className="mt-5 rounded-2xl border border-white/10 bg-black p-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                  Enter Claim Code
                </p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <input
                    value={claimCode}
                    onChange={(event) => setClaimCode(event.target.value.toUpperCase())}
                    placeholder="OH-7K92QF"
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-[#0d0d0d] px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-white outline-none placeholder:text-white/25 focus:border-[#e1062a]"
                  />
                  <button
                    type="button"
                    onClick={() => loadClaimAccess({ code: claimCode })}
                    disabled={validatingClaim || claimCode.trim().length < 4}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {validatingClaim ? "Checking..." : "Validate Code"}
                  </button>
                </div>
                <p className="mt-3 text-xs font-bold text-white/40">
                  You can browse listings below, but submitting a claim requires the QR code or the printed claim code at the location.
                </p>
              </div>
              {results.length > 0 && (
                <div className="mt-4 space-y-3">
                  {results.map((location) => {
                    const selected = selectedLocation?.id === location.id;

                    return (
                      <button
                        key={location.id}
                        type="button"
                        onClick={() => { selectLocation(location); setClaimAccess(null); }}
                        className={`w-full rounded-2xl border p-4 text-left transition ${
                          selected
                            ? "border-[#e1062a] bg-[#e1062a]/15"
                            : "border-white/10 bg-black hover:border-white/30"
                        }`}
                      >
                        <span className="block text-base font-black text-white">
                          {getLocationDisplayName(location)}
                        </span>
                        <span className="mt-1 block text-sm font-bold text-white/45">
                          {getLocationAddress(location) || "Address unavailable"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/location/apply/new"
                  className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-center text-sm font-black text-white/70 transition hover:bg-white hover:text-black"
                >
                  Can’t find it? Add new location
                </Link>
                <button
                  type="button"
                  onClick={openQrScanner}
                  className="rounded-2xl bg-[#e1062a] px-5 py-3 text-sm font-black text-white transition hover:bg-red-500"
                >
                  Scan QR Code
                </button>
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
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              Claim Request
            </p>
            <h2 className="mt-3 text-2xl font-black">Owner/contact info</h2>
            <p className="mt-2 text-sm leading-6 text-white/45">
              We only need your selected listing and contact details for this
              claim request.
            </p>

            {selectedLocation && (
              <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-black">
                {(selectedLocation.main_image || selectedLocation.image_url) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedLocation.main_image || selectedLocation.image_url || ""}
                    alt=""
                    className="h-40 w-full object-cover"
                  />
                )}
                <div className="p-4">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">
                    Selected location
                  </p>
                  <h3 className="mt-2 text-xl font-black">
                    {getLocationDisplayName(selectedLocation)}
                  </h3>
                  <p className="mt-2 text-sm font-bold text-white/45">
                    {getLocationAddress(selectedLocation) || "Address unavailable"}
                  </p>
                  {claimAccess ? (
                    <p className="mt-3 rounded-full bg-emerald-500/15 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-200">
                      Claim access verified by {claimAccess.mode === "token" ? "QR code" : "claim code"}
                    </p>
                  ) : (
                    <p className="mt-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-3 text-xs font-bold leading-5 text-amber-100">
                      To protect businesses, claiming requires the QR code or claim code provided by the location.
                    </p>
                  )}
                  {(selectedLocation.location_type ||
                    selectedLocation.primary_category) && (
                    <p className="mt-3 text-xs font-black uppercase tracking-[0.2em] text-[#e1062a]">
                      {[selectedLocation.location_type, selectedLocation.primary_category]
                        .filter(Boolean)
                        .join(" • ")}
                    </p>
                  )}
                </div>
              </div>
            )}

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

            <form onSubmit={submitClaim} className="mt-6 space-y-4">
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
                  onChange={(event) => updateField("notes", event.target.value)}
                  placeholder="Tell us how you are connected to this business."
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
                  data-callback="onTheOutHavenClaimTurnstileSuccess"
                  data-expired-callback="onTheOutHavenClaimTurnstileExpired"
                  data-theme="dark"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !claimAccess}
                className="w-full rounded-2xl bg-[#e1062a] px-6 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/25 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Submitting..." : claimAccess ? "Submit Claim Request" : "Validate QR or Claim Code First"}
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
