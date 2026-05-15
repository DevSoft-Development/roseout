"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

declare global {
  interface Window {
    turnstile?: any;
    google?: any;
    initTheOutHavenGooglePlaces?: () => void;
    onTheOutHavenTurnstileSuccess?: (token: string) => void;
    onTheOutHavenTurnstileExpired?: () => void;
  }
}

type RequestType = "claim" | "add";

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

  const autocompleteServiceRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);

  const [requestType, setRequestType] = useState<RequestType>("claim");

  const [form, setForm] = useState<FormState>(
    getInitialForm("claim")
  );

  const [captchaToken, setCaptchaToken] = useState("");
  const [loading, setLoading] = useState(false);

  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState("");

  const [googleLoaded, setGoogleLoaded] = useState(false);
  const [googleAddressReady, setGoogleAddressReady] =
    useState(false);

  const [addressPredictions, setAddressPredictions] =
    useState<any[]>([]);

  const [addressLoading, setAddressLoading] =
    useState(false);

  useEffect(() => {
    document.title =
      "Claim or Add Your Location | TheOutHaven";

    window.onTheOutHavenTurnstileSuccess = (
      token: string
    ) => {
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

  useEffect(() => {
    window.initTheOutHavenGooglePlaces = () => {
      setGoogleLoaded(true);
    };

    if (window.google?.maps?.places) {
      setGoogleLoaded(true);
    }

    return () => {
      delete window.initTheOutHavenGooglePlaces;
    };
  }, []);

  useEffect(() => {
    if (!googleLoaded) return;

    if (
      !window.google?.maps?.places?.AutocompleteService
    ) {
      return;
    }

    autocompleteServiceRef.current =
      new window.google.maps.places.AutocompleteService();

    geocoderRef.current =
      new window.google.maps.Geocoder();

    setGoogleAddressReady(true);
  }, [googleLoaded]);

  const chooseRequestType = (
    type: RequestType
  ) => {
    setRequestType(type);

    setForm((prev) => ({
      ...prev,
      request_type:
        type === "claim"
          ? "Claim existing listing"
          : "Add new location",
    }));

    setError("");
    setSuccess("");
  };

  const updateField = (
    field: keyof FormState,
    value: string
  ) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleAddressChange = (value: string) => {
    updateField("address", value);

    if (
      !autocompleteServiceRef.current ||
      value.trim().length < 2
    ) {
      setAddressPredictions([]);
      setAddressLoading(false);
      return;
    }

    setAddressLoading(true);

    autocompleteServiceRef.current.getPlacePredictions(
      {
        input: value,
        componentRestrictions: {
          country: "us",
        },
        types: ["geocode"],
      },
      (
        predictions: any[] | null,
        status: string
      ) => {
        setAddressLoading(false);

        console.log(
          "Google autocomplete status:",
          status
        );

        if (
          status !== "OK" ||
          !predictions
        ) {
          setAddressPredictions([]);
          return;
        }

        setAddressPredictions(predictions);
      }
    );
  };

  const selectAddressPrediction = (
    prediction: any
  ) => {
    if (!geocoderRef.current) return;

    geocoderRef.current.geocode(
      {
        placeId: prediction.place_id,
      },
      (
        results: any[] | null,
        status: string
      ) => {
        if (
          status !== "OK" ||
          !results?.[0]
        ) {
          return;
        }

        const result = results[0];

        const components =
          result.address_components || [];

        const getComponent = (
          type: string,
          short = false
        ) => {
          const component = components.find(
            (item: any) =>
              item.types?.includes(type)
          );

          if (!component) return "";

          return short
            ? component.short_name || ""
            : component.long_name || "";
        };

        const streetNumber =
          getComponent("street_number");

        const route =
          getComponent("route");

        const city =
          getComponent("locality") ||
          getComponent("postal_town") ||
          getComponent("sublocality") ||
          getComponent(
            "administrative_area_level_2"
          );

        const state = getComponent(
          "administrative_area_level_1",
          true
        );

        const zipCode =
          getComponent("postal_code");

        setForm((prev) => ({
          ...prev,
          address:
            streetNumber && route
              ? `${streetNumber} ${route}`
              : result.formatted_address ||
                prediction.description,
          city,
          state,
          zip_code: zipCode,
        }));

        setAddressPredictions([]);
      }
    );
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

    const stream = videoRef.current
      ?.srcObject as MediaStream | null;

    if (stream) {
      stream
        .getTracks()
        .forEach((track) =>
          track.stop()
        );
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
      if (
        !navigator.mediaDevices?.getUserMedia
      ) {
        setScanError(
          "Camera scanning is not supported on this device."
        );

        return;
      }

      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            video: {
              facingMode: "environment",
            },
          }
        );

      if (videoRef.current) {
        videoRef.current.srcObject =
          stream;

        await videoRef.current.play();
      }
    } catch {
      setScanError(
        "Camera access was denied or unavailable."
      );
    }
  };

  const submitRequest = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    if (loading) return;

    setError("");
    setSuccess("");

    if (!form.location_name.trim()) {
      setError(
        "Please enter your business / location name."
      );

      return;
    }

    if (!form.address.trim()) {
      setError(
        "Please select or enter the business address."
      );

      return;
    }

    if (!form.owner_name.trim()) {
      setError(
        "Please enter the owner or manager name."
      );

      return;
    }

    if (!form.owner_email.trim()) {
      setError(
        "Please enter an email address."
      );

      return;
    }

    if (!captchaToken) {
      setError(
        "Please complete the CAPTCHA before submitting."
      );

      return;
    }

    setLoading(true);

    try {
      const res = await fetch(
        "/api/locations/apply",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            ...form,
            plan: "free",
            flow: requestType,
            captchaToken,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(
          data.error ||
            "Something went wrong."
        );

        resetCaptcha();

        return;
      }

      setSuccess(
        data.message ||
          (requestType === "claim"
            ? "Claim request submitted."
            : "New location submitted.")
      );

      setForm(
        getInitialForm(requestType)
      );

      setAddressPredictions([]);

      resetCaptcha();
    } catch {
      setError(
        "Could not submit request."
      );

      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const isClaim =
    requestType === "claim";

  return (
    <main className="min-h-screen bg-black text-white">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        async
        defer
      />

      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&callback=initTheOutHavenGooglePlaces`}
        strategy="afterInteractive"
      />

      <TheOutHavenHeader />

      <section className="px-6 pt-32 pb-20">
        <div className="mx-auto max-w-7xl grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">
              Free Business Listing
            </p>

            <h1 className="mt-5 text-5xl font-black leading-tight md:text-6xl">
              Claim your listing or add
              a new location.
            </h1>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  chooseRequestType(
                    "claim"
                  )
                }
                className={`rounded-[2rem] border p-6 text-left transition ${
                  isClaim
                    ? "border-[#e1062a] bg-[#e1062a]/15"
                    : "border-white/10 bg-white/[0.04]"
                }`}
              >
                <h2 className="text-2xl font-black">
                  Claim Existing
                </h2>
              </button>

              <button
                type="button"
                onClick={() =>
                  chooseRequestType(
                    "add"
                  )
                }
                className={`rounded-[2rem] border p-6 text-left transition ${
                  !isClaim
                    ? "border-[#e1062a] bg-[#e1062a]/15"
                    : "border-white/10 bg-white/[0.04]"
                }`}
              >
                <h2 className="text-2xl font-black">
                  Add New
                </h2>
              </button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[#0d0d0d] p-6">
            <form
              onSubmit={submitRequest}
              className="space-y-4"
            >
              <Field
                label="Business Name"
                placeholder="Business name"
                value={form.location_name}
                onChange={(value) =>
                  updateField(
                    "location_name",
                    value
                  )
                }
                required
              />

              <AddressField
                inputRef={addressInputRef}
                label="Google Address"
                placeholder="Start typing address"
                value={form.address}
                onChange={
                  handleAddressChange
                }
                predictions={
                  addressPredictions
                }
                onSelectPrediction={
                  selectAddressPrediction
                }
                loading={
                  addressLoading
                }
                required
                ready={
                  googleAddressReady
                }
              />

              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  label="City"
                  placeholder="City"
                  value={form.city}
                  onChange={(value) =>
                    updateField(
                      "city",
                      value
                    )
                  }
                />

                <Field
                  label="State"
                  placeholder="State"
                  value={form.state}
                  onChange={(value) =>
                    updateField(
                      "state",
                      value
                    )
                  }
                />

                <Field
                  label="Zip"
                  placeholder="Zip"
                  value={form.zip_code}
                  onChange={(value) =>
                    updateField(
                      "zip_code",
                      value
                    )
                  }
                />
              </div>

              <Field
                label="Owner Name"
                placeholder="Full name"
                value={form.owner_name}
                onChange={(value) =>
                  updateField(
                    "owner_name",
                    value
                  )
                }
                required
              />

              <Field
                label="Email"
                placeholder="Email"
                value={form.owner_email}
                onChange={(value) =>
                  updateField(
                    "owner_email",
                    value
                  )
                }
                required
                type="email"
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-[#e1062a] px-6 py-4 text-sm font-black text-white"
              >
                {loading
                  ? "Submitting..."
                  : "Submit"}
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
      </span>

      <input
        type={type}
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        placeholder={placeholder}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm font-bold text-white"
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
  ready,
  predictions,
  onSelectPrediction,
  loading,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  ready: boolean;
  predictions: any[];
  onSelectPrediction: (
    prediction: any
  ) => void;
  loading: boolean;
}) {
  return (
    <div className="relative">
      <label className="block">
        <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
          {label}
        </span>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) =>
            onChange(e.target.value)
          }
          placeholder={placeholder}
          autoComplete="off"
          className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm font-bold text-white"
        />
      </label>

      {predictions.length > 0 && (
        <div className="absolute z-[999999] mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] shadow-2xl">
          {predictions.map(
            (prediction) => (
              <button
                key={
                  prediction.place_id
                }
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();

                  onSelectPrediction(
                    prediction
                  );
                }}
                className="block w-full border-b border-white/10 px-4 py-3 text-left text-sm font-bold text-white/75 hover:bg-white/10"
              >
                {
                  prediction.description
                }
              </button>
            )
          )}
        </div>
      )}

      <p className="mt-2 text-xs font-semibold text-white/35">
        {loading
          ? "Searching Google addresses..."
          : ready
            ? "Start typing address."
            : "Loading Google services..."}
      </p>
    </div>
  );
}