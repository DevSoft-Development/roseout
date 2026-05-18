"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { clampScore } from "@/lib/clampScore";
import ScoreBadge from "@/components/ScoreBadge";
import GoogleAddressAutocomplete, {
  type GoogleAddressFields,
} from "@/components/GoogleAddressAutocomplete";
import { getIsClaimed } from "@/lib/locationClaim";
import { getLocationScore } from "@/lib/locationScore";
import { supabase } from "@/lib/supabase";

type LocationType = "restaurants" | "activities";

type FormState = {
  name: string;
  description: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  neighborhood: string;
  main_image?: string | null;
  image_url: string;
  images?: string[] | null;
  is_searchable?: string;
  data_status?: string;
  missing_fields?: string;
  website: string;
  external_reservation_url?: string | null;
  reservation_url: string;
  reservation_link?: string | null;
  reservation_enabled?: boolean | null;
  booking_url: string;
  uses_internal_reservations: boolean;
  internal_reservations_enabled: boolean;
  allow_external_reservations: boolean;
  reservation_source: string;
  phone: string;
  price_range: string;
  cuisine: string;
  activity_type: string;
  atmosphere: string;
  noise_level: string;
  dress_code: string;
  parking_info: string;
  operating_hours?: unknown;
  special_hours?: unknown;
  holiday_closures?: unknown;
  hours: string | null;
  days_of_operation?: string[] | null;
  kitchen_closing_time?: string | null;
  best_for: string;
  special_features: string;
  signature_items: string;
  primary_tag: string;
  date_style_tags: string;
  search_keywords: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  claim_status: string;
  theouthaven_score: string | number;
  latitude: string | number;
  longitude: string | number;
  google_place_id: string;
  formatted_address: string;
};

type LocationRecord = Record<string, unknown> & {
  is_claimed?: boolean | null;
  claimed?: boolean | null;
  claim_status?: string | null;
  claimed_at?: string | null;
  claimed_by_email?: string | null;
  owner_user_id?: string | null;
};

function normalizeLocationTypeParam(value: string): LocationType | null {
  if (value === "restaurants" || value === "restaurant") return "restaurants";
  if (value === "activities" || value === "activity" || value === "activitys") {
    return "activities";
  }

  return null;
}

function calculateUpdatedScore(location: LocationRecord) {
  let score = 40;

  const has = (value: unknown) => {
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined && String(value).trim() !== "";
  };

  if (has(location.description)) score += 8;
  if (has(location.image_url)) score += 8;
  if (has(location.website)) score += 4;
  if (
    has(location.external_reservation_url) ||
    has(location.reservation_url) ||
    has(location.reservation_link)
  ) score += 5;
  if (has(location.price_range)) score += 4;
  if (has(location.atmosphere)) score += 6;
  if (has(location.primary_tag)) score += 5;
  if (has(location.date_style_tags)) score += 5;
  if (has(location.best_for)) score += 5;
  if (has(location.special_features)) score += 5;
  if (has(location.search_keywords)) score += 5;
  if (has(location.latitude) && has(location.longitude)) score += 5;
  if (getIsClaimed(location)) score += 8;
  if (location.rating) score += Math.min(Number(location.rating) * 2, 10);

  return clampScore(score);
}

export default function EditLocationPage() {
  useEffect(() => {
    document.title = "Edit Location | TheOutHaven Admin";
  }, []);
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const rawType = String(params.type || "");
  const type = normalizeLocationTypeParam(rawType);
  const id = String(params.id || "");
  const from = searchParams.get("from") || "/locations/dashboard";

  const table = type || "restaurants";
  const nameField = type === "activities" ? "activity_name" : "restaurant_name";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [message, setMessage] = useState("");
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [effectiveId, setEffectiveId] = useState(id);
  const [newGalleryImage, setNewGalleryImage] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);

  const [form, setForm] = useState<FormState>({
    name: "",
    description: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    neighborhood: "",
    main_image: "",
    image_url: "",
    images: [],
    website: "",
    reservation_url: "",
    booking_url: "",
    uses_internal_reservations: false,
    internal_reservations_enabled: false,
    allow_external_reservations: true,
    reservation_source: "external",
    phone: "",
    price_range: "",
    cuisine: "",
    activity_type: "",
    atmosphere: "",
    noise_level: "",
    dress_code: "",
    parking_info: "",
    operating_hours: null,
    special_hours: null,
    holiday_closures: null,
    hours: "",
    days_of_operation: null,
    kitchen_closing_time: null,
    best_for: "",
    special_features: "",
    signature_items: "",
    primary_tag: "",
    date_style_tags: "",
    search_keywords: "",
    owner_name: "",
    owner_email: "",
    owner_phone: "",
    claim_status: "",
    theouthaven_score: "",
    latitude: "",
    longitude: "",
    google_place_id: "",
    formatted_address: "",
    is_searchable: "",
    data_status: "",
    missing_fields: "",
  });

  useEffect(() => {
    const loadLocation = async () => {
      setLoading(true);
      setMessage("");

      try {
        const res = await fetch(
          `/api/locations/edit-context?type=${table}&id=${encodeURIComponent(id)}`,
          { cache: "no-store" }
        );

        const result = await res.json();

        if (!res.ok || !result.location) {
          setMessage(result.error || "Location not found.");
          setLoading(false);
          return;
        }

        const data = result.location;

        setIsImpersonating(Boolean(result.isImpersonating));
        setEffectiveId(result.effectiveId || id);

        setForm({
          name: data[nameField] || data.name || "",
          description: data.description || "",
          address: data.address || "",
          city: data.city || "",
          state: data.state || "",
          zip_code: data.zip_code || "",
          neighborhood: data.neighborhood || "",
          main_image: data.main_image || data.image_url || "",
          image_url: data.image_url || data.main_image || "",
          images: Array.isArray(data.images) ? data.images.filter(Boolean) : [],
          website: data.website || "",
          reservation_url: data.reservation_url || data.reservation_link || "",
          booking_url: data.booking_url || "",
          uses_internal_reservations: Boolean(data.uses_internal_reservations),
          internal_reservations_enabled: Boolean(data.internal_reservations_enabled),
          allow_external_reservations: data.reservation_source !== "internal" && data.reservation_source !== "none",
          reservation_source: data.reservation_source || (data.reservation_enabled ? "internal" : "external"),
          phone: data.phone || "",
          price_range: data.price_range || "",
          cuisine: data.cuisine || "",
          activity_type: data.activity_type || "",
          atmosphere: data.atmosphere || "",
          noise_level: data.noise_level || "",
          dress_code: data.dress_code || "",
          parking_info: data.parking_info || "",
          operating_hours: data.operating_hours ?? null,
          special_hours: data.special_hours ?? null,
          holiday_closures: data.holiday_closures ?? null,
          hours: data.hours || "",
          days_of_operation: Array.isArray(data.days_of_operation)
            ? data.days_of_operation
            : null,
          kitchen_closing_time: data.kitchen_closing_time || null,
          best_for: Array.isArray(data.best_for)
            ? data.best_for.join(", ")
            : data.best_for || "",
          special_features: Array.isArray(data.special_features)
            ? data.special_features.join(", ")
            : data.special_features || "",
          signature_items: Array.isArray(data.signature_items)
            ? data.signature_items.join(", ")
            : data.signature_items || "",
          primary_tag: data.primary_tag || "",
          date_style_tags: Array.isArray(data.date_style_tags)
            ? data.date_style_tags.join(", ")
            : data.date_style_tags || "",
          search_keywords: Array.isArray(data.search_keywords)
            ? data.search_keywords.join(", ")
            : data.search_keywords || "",
          owner_name: data.owner_name || "",
          owner_email: data.owner_email || "",
          owner_phone: data.owner_phone || "",
          claim_status: data.claim_status || "",
          theouthaven_score: clampScore(getLocationScore(data)),
          latitude: data.latitude ?? "",
          longitude: data.longitude ?? "",
          google_place_id: data.google_place_id || "",
          formatted_address: data.formatted_address || "",
          is_searchable: typeof data.is_searchable === "boolean" ? String(data.is_searchable) : "",
          data_status: data.data_status || "",
          missing_fields: Array.isArray(data.missing_fields) ? data.missing_fields.join(", ") : data.missing_fields || "",
        });
      } catch {
        setMessage("Location failed to load.");
      } finally {
        setLoading(false);
      }
    };

    if (id && type) loadLocation();
  }, [id, type, table, nameField]);

  const update = (key: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const toArray = (value: string) => {
    return value
      ? value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
  };

  const optimizeWithAI = async () => {
    setOptimizing(true);
    setMessage("");

    try {
      const res = await fetch("/api/locations/optimize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type,
          name: form.name,
          description: form.description,
          city: form.city,
          neighborhood: form.neighborhood,
          cuisine: form.cuisine,
          activity_type: form.activity_type,
          atmosphere: form.atmosphere,
          best_for: form.best_for,
          special_features: form.special_features,
          signature_items: form.signature_items,
          primary_tag: form.primary_tag,
          date_style_tags: form.date_style_tags,
          search_keywords: form.search_keywords,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || "AI optimization failed.");
        return;
      }

      setForm((prev) => ({
        ...prev,
        description: data.description || prev.description,
        primary_tag: data.primary_tag || prev.primary_tag,
        date_style_tags: Array.isArray(data.date_style_tags)
          ? data.date_style_tags.join(", ")
          : prev.date_style_tags,
        best_for: Array.isArray(data.best_for)
          ? data.best_for.join(", ")
          : prev.best_for,
        special_features: Array.isArray(data.special_features)
          ? data.special_features.join(", ")
          : prev.special_features,
        search_keywords: Array.isArray(data.search_keywords)
          ? data.search_keywords.join(", ")
          : prev.search_keywords,
      }));

      setMessage("✅ AI optimization applied. Review and save changes.");
    } catch {
      setMessage("AI optimization failed.");
    } finally {
      setOptimizing(false);
    }
  };

  const saveLocation = async () => {
    setSaving(true);
    setMessage("");

    const payload: Record<string, unknown> = {
      [nameField]: form.name,
      name: form.name,
      description: form.description,
      address: form.address,
      city: form.city,
      state: form.state,
      zip_code: form.zip_code,
      neighborhood: form.neighborhood,
      main_image: form.main_image || form.image_url || null,
      image_url: form.image_url || form.main_image || null,
      images: form.images || [],
      website: form.website,
      reservation_url: form.reservation_url,
      booking_url: form.booking_url || form.reservation_url || null,
      uses_internal_reservations: form.uses_internal_reservations,
      internal_reservations_enabled: form.internal_reservations_enabled,
      reservation_source: form.reservation_source,
      phone: form.phone,
      price_range: form.price_range,
      atmosphere: form.atmosphere,
      noise_level: form.noise_level,
      dress_code: form.dress_code,
      parking_info: form.parking_info,
      operating_hours: form.operating_hours ?? null,
      special_hours: form.special_hours ?? null,
      holiday_closures: form.holiday_closures ?? null,
      hours: form.hours,
      best_for: toArray(form.best_for),
      special_features: toArray(form.special_features),
      signature_items: toArray(form.signature_items),
      primary_tag: form.primary_tag,
      date_style_tags: toArray(form.date_style_tags),
      search_keywords: toArray(form.search_keywords),
      owner_name: form.owner_name,
      owner_email: form.owner_email,
      owner_phone: form.owner_phone,
      claim_status: form.claim_status,
      latitude: form.latitude === "" ? null : Number(form.latitude),
      longitude: form.longitude === "" ? null : Number(form.longitude),
      google_place_id: form.google_place_id || null,
      formatted_address: form.formatted_address || null,
    };

    if (type === "restaurants") {
      payload.cuisine = form.cuisine;
      payload.days_of_operation = form.days_of_operation ?? null;
      payload.kitchen_closing_time = form.kitchen_closing_time ?? null;
    }

    if (type === "activities") payload.activity_type = form.activity_type;

    const calculatedScore = calculateUpdatedScore(payload);
    payload.theouthaven_score = calculatedScore;

    try {
      const res = await fetch("/api/locations/edit-context", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: table,
          id: effectiveId || id,
          payload,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setMessage(result.error || "Failed to save location.");
        setSaving(false);
        return;
      }

      setEffectiveId(result.effectiveId || effectiveId);

      setForm((prev) => ({
        ...prev,
        theouthaven_score: calculatedScore,
      }));

      setMessage(`✅ Saved successfully. TheOutHaven Score: ${calculatedScore}/100`);
    } catch {
      setMessage("Failed to save location.");
    } finally {
      setSaving(false);
    }
  };

  const safeScore = clampScore(form.theouthaven_score);
  const mainImage = form.main_image || form.image_url || "";
  const galleryImages = Array.from(new Set([mainImage, ...(form.images || [])].filter(Boolean))) as string[];

  const setMainImage = (url: string) => {
    setForm((prev) => ({
      ...prev,
      main_image: url,
      image_url: url,
      images: Array.from(new Set([...(prev.images || []), url])).filter(Boolean),
    }));
  };

  const addGalleryImage = () => {
    const url = newGalleryImage.trim();
    if (!url) return;

    setForm((prev) => ({
      ...prev,
      main_image: prev.main_image || prev.image_url || url,
      image_url: prev.image_url || prev.main_image || url,
      images: Array.from(new Set([...(prev.images || []), url])).filter(Boolean),
    }));
    setNewGalleryImage("");
  };

  const removeGalleryImage = (url: string) => {
    setForm((prev) => {
      const nextImages = (prev.images || []).filter((image) => image !== url);
      const wasMain = (prev.main_image || prev.image_url) === url;
      const nextMain = wasMain ? nextImages[0] || "" : prev.main_image || prev.image_url || "";

      return {
        ...prev,
        images: nextImages,
        main_image: nextMain,
        image_url: nextMain,
      };
    });
  };

  const uploadGalleryImage = async (file: File | null) => {
    if (!file) return;
    setUploadingImage(true);
    setMessage("");

    const extension = file.name.split(".").pop() || "jpg";
    const path = `locations/${type}/${effectiveId || id}/${Date.now()}.${extension}`;
    const { data, error } = await supabase.storage.from("location-images").upload(path, file, { upsert: true });

    if (error) {
      setMessage("Image upload is not enabled for this environment. Paste an image URL instead.");
      setUploadingImage(false);
      return;
    }

    const { data: publicUrl } = supabase.storage.from("location-images").getPublicUrl(data.path);
    const url = publicUrl.publicUrl;
    if (url) {
      setNewGalleryImage(url);
      setForm((prev) => ({
        ...prev,
        main_image: prev.main_image || prev.image_url || url,
        image_url: prev.image_url || prev.main_image || url,
        images: Array.from(new Set([...(prev.images || []), url])).filter(Boolean),
      }));
      setMessage("✅ Image uploaded. Save changes to keep it on this listing.");
    }
    setUploadingImage(false);
  };

  const setInternalReservations = (enabled: boolean) => {
    setForm((prev) => ({
      ...prev,
      uses_internal_reservations: enabled,
      internal_reservations_enabled: enabled,
      reservation_source: enabled
        ? prev.allow_external_reservations
          ? "both"
          : "internal"
        : prev.allow_external_reservations
        ? "external"
        : "none",
    }));
  };

  const setAllowExternalReservations = (enabled: boolean) => {
    setForm((prev) => ({
      ...prev,
      allow_external_reservations: enabled,
      reservation_source: prev.internal_reservations_enabled || prev.uses_internal_reservations
        ? enabled
          ? "both"
          : "internal"
        : enabled
        ? "external"
        : "none",
    }));
  };

  const publicPreviewHref = `/locations/${type}/${effectiveId || id}`;

  const isSuccess =
    message.includes("✅") ||
    message.toLowerCase().includes("success") ||
    message.toLowerCase().includes("applied");

  if (!type) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090706] px-5 text-white">
        <div className="max-w-lg rounded-[2rem] border border-red-400/30 bg-red-400/10 p-8 text-center shadow-2xl">
          <p className="text-sm font-black uppercase tracking-[0.25em] text-red-100">
            Invalid Link
          </p>
          <h1 className="mt-3 text-3xl font-black">Location edit link is invalid.</h1>
          <p className="mt-3 text-sm leading-6 text-white/60">
            Please return to the locations dashboard and choose a valid restaurant
            or activity listing.
          </p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080407] pt-28 text-white">
        <div className="text-center">
          <div className="mx-auto mb-5 h-12 w-12 animate-pulse rounded-full bg-gradient-to-br from-rose-500 to-fuchsia-600 shadow-lg shadow-rose-500/30" />
          <p className="text-sm font-black uppercase tracking-[0.3em] text-rose-200/70">
            Loading Location
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080407] pt-20 text-white">
      <section className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(244,63,94,0.28),_transparent_34%),linear-gradient(135deg,#16080d,#080407_62%,#000)]">
        <div className="absolute right-[-120px] top-[-120px] h-80 w-80 rounded-full bg-rose-600/20 blur-3xl" />
        <div className="absolute bottom-[-170px] left-[-120px] h-96 w-96 rounded-full bg-fuchsia-600/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-5 py-5 sm:px-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => router.push(from)}
              className="rounded-full border border-white/10 bg-white/[0.06] px-5 py-2.5 text-sm font-black text-white/85 transition hover:bg-white hover:text-black"
            >
              ← Back
            </button>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={optimizeWithAI}
                disabled={optimizing || saving}
                className="rounded-full border border-rose-300/30 bg-rose-500/10 px-5 py-2.5 text-sm font-black text-rose-100 transition hover:bg-rose-500 hover:text-white disabled:opacity-50"
              >
                {optimizing ? "Optimizing..." : "✨ Improve With AI"}
              </button>

              <button
                onClick={saveLocation}
                disabled={saving || optimizing}
                className="rounded-full bg-white px-6 py-2.5 text-sm font-black text-black transition hover:bg-rose-100 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>

          {isImpersonating && (
            <div className="mb-5 inline-flex rounded-full border border-rose-300/30 bg-rose-500/15 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-rose-100">
              Admin viewing this location
            </div>
          )}

          <div className="grid gap-8 lg:grid-cols-[96px_1fr_190px] lg:items-center">
            <div className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-black/35 shadow-2xl">
              {mainImage ? (
                <Image src={mainImage} alt={form.name || "Location"} width={360} height={260} className="h-24 w-full object-cover" />
              ) : (
                <div className="flex h-24 items-center justify-center text-xs font-black uppercase tracking-[0.2em] text-white/30">No Image</div>
              )}
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-200/70">
                TheOutHaven Admin · Location Studio
              </p>

              <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">
                {form.name || "Edit Location"}
              </h1>

              <div className="mt-4 flex flex-wrap gap-2">
                <Tag>{type === "restaurants" ? form.cuisine || "Restaurant" : form.activity_type || "Activity"}</Tag>
                <Tag>{form.claim_status || "Unclaimed"}</Tag>
                <Tag>{form.data_status || "Quality review"}</Tag>
              </div>

              <p className="mt-3 max-w-2xl text-xs leading-5 text-white/60">
                Refine this listing with a cleaner section hierarchy, premium media, address intelligence, discovery signals, reserve settings, claim tools, and data quality controls.
              </p>
            </div>

            <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-3 shadow-2xl backdrop-blur">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/45">
                Current Score
              </p>
              <div className="rounded-[1rem] border border-white/10 bg-black/35 p-3 text-white">
                <ScoreBadge score={safeScore} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
        {message && (
          <div
            className={`mb-6 rounded-[1.5rem] border p-4 text-sm font-bold shadow-xl ${
              isSuccess
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                : "border-red-400/30 bg-red-400/10 text-red-100"
            }`}
          >
            {message}
          </div>
        )}

        <nav className="mb-6 flex gap-2 overflow-x-auto rounded-full border border-white/10 bg-white/[0.04] p-2 text-xs font-black uppercase tracking-[0.18em] text-white/55">
          {["Basic Info", "Address", "Images", "Discovery", "Reservations", "Claim & QR", "Data Quality"].map((item) => (
            <a key={item} href={`#${item.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and")}`} className="shrink-0 rounded-full px-4 py-2 transition hover:bg-white hover:text-black">{item}</a>
          ))}
        </nav>

        <div className="grid gap-6 lg:grid-cols-[1fr_410px]">
          <section className="space-y-6">
            <Panel id="basic-info" title="Basic Info">
              <Field label="Location Name" value={form.name} onChange={(v) => update("name", v)} />

              <TextArea
                label="Short Description"
                helper="This helps TheOutHaven understand what makes the location special."
                value={form.description}
                onChange={(v) => update("description", v)}
              />

              <div className="grid gap-4 md:grid-cols-2">
                {type === "restaurants" && (
                  <Field
                    label="Cuisine"
                    value={form.cuisine}
                    onChange={(v) => update("cuisine", v)}
                    placeholder="Italian, Caribbean, Steakhouse"
                  />
                )}

                {type === "activities" && (
                  <Field
                    label="Activity Type"
                    value={form.activity_type}
                    onChange={(v) => update("activity_type", v)}
                    placeholder="Bowling, Museum, Spa, Lounge"
                  />
                )}

                <Field
                  label="Price Range"
                  value={form.price_range}
                  onChange={(v) => update("price_range", v)}
                  placeholder="$, $$, $$$"
                />
              </div>

              <Field
                label="Primary Tag"
                value={form.primary_tag}
                onChange={(v) => update("primary_tag", v)}
                placeholder="Romantic, Trendy, Cozy, Upscale"
              />
            </Panel>

            <Panel id="address" title="Address">
              <GoogleAddressAutocomplete
                label="Address"
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
                isAdmin={from.startsWith("/admin")}
                showCoordinateRepairTools={from.startsWith("/admin")}
                onAddressChange={(value) => update("address", value)}
                onAddressSelect={(selected: GoogleAddressFields) =>
                  setForm((prev) => ({ ...prev, ...selected }))
                }
                inputClassName="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-400"
                labelClassName="text-xs font-black uppercase tracking-[0.18em] text-white/45"
                statusClassName="mt-2 text-xs font-bold text-white/45"
                dropdownClassName="absolute z-[999999] mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#121212] shadow-2xl"
                predictionButtonClassName="block w-full border-b border-white/10 px-4 py-3 text-left text-sm font-bold text-white/75 transition last:border-b-0 hover:bg-white/10"
                buttonClassName="mt-3 rounded-full border border-rose-300/30 bg-rose-500/10 px-4 py-2 text-xs font-black text-rose-100 transition hover:bg-rose-500 hover:text-white disabled:opacity-50"
              />

              <div className="grid gap-4 md:grid-cols-4">
                <Field label="City" value={form.city} onChange={(v) => update("city", v)} />
                <Field label="State" value={form.state} onChange={(v) => update("state", v)} />
                <Field label="Zip Code" value={form.zip_code} onChange={(v) => update("zip_code", v)} />
                <Field label="Neighborhood" value={form.neighborhood} onChange={(v) => update("neighborhood", v)} />
              </div>

              <input type="hidden" value={String(form.latitude || "")} readOnly />
              <input type="hidden" value={String(form.longitude || "")} readOnly />
            </Panel>

            <Panel id="images" title="Images">
              <Field label="Main Image URL" value={mainImage} onChange={setMainImage} helper="Saved to main_image and image_url for compatibility." />

              <div className="rounded-[1.25rem] border border-white/10 bg-black/25 p-4">
                <label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Upload image</label>
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingImage}
                  onChange={(event) => uploadGalleryImage(event.target.files?.[0] || null)}
                  className="mt-2 block w-full rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm font-semibold text-white file:mr-4 file:rounded-full file:border-0 file:bg-rose-500 file:px-4 file:py-2 file:text-xs file:font-black file:text-white disabled:opacity-50"
                />
                <p className="mt-2 text-xs font-semibold text-white/35">If the storage bucket is not available, URL updates still work.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Field label="Add Gallery Image URL" value={newGalleryImage} onChange={setNewGalleryImage} placeholder="https://..." />
                <button type="button" onClick={addGalleryImage} className="self-end rounded-full bg-rose-500 px-5 py-3 text-xs font-black uppercase tracking-wide text-white transition hover:bg-rose-600">Add image</button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {(galleryImages.length ? galleryImages : [""]).slice(0, 9).map((image, index) => (
                  <div key={`${image}-${index}`} className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                    {image ? <Image src={image} alt={`Gallery ${index + 1}`} width={260} height={180} className="h-28 w-full object-cover" /> : <div className="flex h-28 items-center justify-center text-xs font-bold text-white/30">Gallery preview</div>}
                    <div className="space-y-2 p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">{image === mainImage ? "Main image" : `Photo ${index + 1}`}</div>
                      {image && (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setMainImage(image)} className="flex-1 rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-white/70 hover:bg-white hover:text-black">Set main</button>
                          <button type="button" onClick={() => removeGalleryImage(image)} className="flex-1 rounded-full border border-rose-300/30 bg-rose-500/10 px-3 py-1.5 text-[10px] font-black uppercase text-rose-100 hover:bg-rose-500 hover:text-white">Remove</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel id="discovery" title="Discovery">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Atmosphere" value={form.atmosphere} onChange={(v) => update("atmosphere", v)} />
                <Field label="Noise Level" value={form.noise_level} onChange={(v) => update("noise_level", v)} />
                <Field label="Dress Code" value={form.dress_code} onChange={(v) => update("dress_code", v)} />
                <Field label="Parking Info" value={form.parking_info} onChange={(v) => update("parking_info", v)} />
              </div>

              <Field label="Best For" helper="Separate with commas." value={form.best_for} onChange={(v) => update("best_for", v)} />
              <Field label="Special Features" helper="Separate with commas." value={form.special_features} onChange={(v) => update("special_features", v)} />
              <Field label="Signature Items / Highlights" helper="Separate with commas." value={form.signature_items} onChange={(v) => update("signature_items", v)} />
            </Panel>


            <Panel id="reservations" title="Reservations">
              <div className="grid gap-4 md:grid-cols-2">
                <ToggleCard
                  title="Use TheOutHaven Reservation System"
                  text="Show the native TheOutHaven reservation flow for this location."
                  checked={form.uses_internal_reservations || form.internal_reservations_enabled}
                  onChange={setInternalReservations}
                />
                <ToggleCard
                  title="Allow External Reservations"
                  text="Keep external provider links available when a valid provider URL exists."
                  checked={form.allow_external_reservations}
                  onChange={setAllowExternalReservations}
                />
              </div>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Reservation Source</span>
                <select
                  value={form.reservation_source}
                  onChange={(event) => update("reservation_source", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-rose-400"
                >
                  <option value="internal">Internal only</option>
                  <option value="external">External only</option>
                  <option value="both">Internal + external</option>
                  <option value="none">No reservation CTA</option>
                </select>
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Website" value={form.website} onChange={(v) => update("website", v)} />
                <Field label="Reservation URL" value={form.reservation_url} onChange={(v) => update("reservation_url", v)} helper="Must be a supported booking provider to render as Reserve." />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Booking URL" value={form.booking_url} onChange={(v) => update("booking_url", v)} />
                <Field label="Public Phone" value={form.phone} onChange={(v) => update("phone", v)} />
              </div>

              <Field label="Hours" value={form.hours || ""} onChange={(v) => update("hours", v)} />
            </Panel>

            <Panel id="claim-and-qr" title="Claim & QR">
              <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-5">
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/45">
                  Owner Contact
                </p>

                <div className="grid gap-4">
                  <Field label="Owner Name" value={form.owner_name} onChange={(v) => update("owner_name", v)} />
                  <Field label="Owner Email" value={form.owner_email} onChange={(v) => update("owner_email", v)} />
                  <Field label="Owner Phone" value={form.owner_phone} onChange={(v) => update("owner_phone", v)} />
                </div>
              </div>
            </Panel>
            <Panel id="data-quality" title="Data Quality">
              <Field label="Date Style Tags" helper="Separate with commas." value={form.date_style_tags} onChange={(v) => update("date_style_tags", v)} />
              <Field label="Search Keywords" helper="Separate with commas." value={form.search_keywords} onChange={(v) => update("search_keywords", v)} />

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="TheOutHaven Score" value={String(safeScore)} onChange={(v) => update("theouthaven_score", v)} helper="This updates automatically when you save." />
                <Field label="Claim Status" value={form.claim_status} onChange={(v) => update("claim_status", v)} />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Searchable" value={form.is_searchable || ""} onChange={(v) => update("is_searchable", v)} helper="true / false" />
                <Field label="Data Status" value={form.data_status || ""} onChange={(v) => update("data_status", v)} />
                <Field label="Missing Fields" value={form.missing_fields || ""} onChange={(v) => update("missing_fields", v)} helper="Visible for admins only." />
              </div>
              <a href={publicPreviewHref} target="_blank" className="inline-flex w-fit rounded-full border border-white/10 px-5 py-3 text-sm font-black text-white/70 transition hover:bg-white hover:text-black">Preview public page</a>
            </Panel>

            <div className="sticky bottom-4 z-30 rounded-[1.5rem] border border-white/10 bg-black/75 p-3 shadow-2xl backdrop-blur-xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-bold text-white/45">Unsaved edits stay local until you save this premium location profile.</p>
                <button
                  onClick={saveLocation}
                  disabled={saving || optimizing}
                  className="rounded-full bg-white px-6 py-3 font-black text-black transition hover:bg-rose-100 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save All Changes"}
                </button>
              </div>
            </div>
          </section>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#12090d] text-white shadow-2xl">
              {mainImage ? (
                <Image
                  src={mainImage}
                  alt={form.name || "Location preview"}
                  width={700}
                  height={420}
                  className="h-72 w-full object-cover"
                />
              ) : (
                <div className="flex h-72 items-center justify-center bg-black/40 text-white/35">
                  No image preview
                </div>
              )}

              <div className="p-5">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-white/45">
                  Listing Preview
                </p>

                <h2 className="mt-2 text-2xl font-black">
                  {form.name || "Location Name"}
                </h2>

                <p className="mt-2 text-sm text-white/50">
                  {[form.address, form.city, form.state, form.zip_code]
                    .filter(Boolean)
                    .join(", ") || "Address will appear here"}
                </p>

                <div className="mt-5 rounded-[1rem] border border-white/10 bg-black/35 p-3">
                  <ScoreBadge score={safeScore} />
                </div>

                {form.description && (
                  <p className="mt-4 text-sm leading-6 text-white/60">
                    {form.description}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {form.primary_tag && <Tag>{form.primary_tag}</Tag>}
                  {form.price_range && <Tag>{form.price_range}</Tag>}
                  {form.claim_status && <Tag>{form.claim_status}</Tag>}
                </div>

                <PreviewBlock title="Why It Stands Out">
                  <PreviewLine label="Atmosphere" value={form.atmosphere} />
                  <PreviewLine label="Best For" value={form.best_for} />
                  <PreviewLine label="Features" value={form.special_features} />
                </PreviewBlock>

                <PreviewBlock title="Owner">
                  <PreviewLine label="Name" value={form.owner_name} />
                  <PreviewLine label="Email" value={form.owner_email} />
                  <PreviewLine label="Phone" value={form.owner_phone} />
                </PreviewBlock>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Panel({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32 rounded-[2rem] border border-white/10 bg-[#12090d] p-6 text-white shadow-2xl">
      <p className="mb-5 text-xs font-black uppercase tracking-[0.25em] text-white/45">
        {title}
      </p>
      <div className="grid gap-5">{children}</div>
    </section>
  );
}

function ToggleCard({
  title,
  text,
  checked,
  onChange,
}: {
  title: string;
  text: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-4 rounded-[1.25rem] border border-white/10 bg-black/25 p-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 accent-rose-600"
      />
      <span>
        <span className="block text-sm font-black text-white">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-white/45">{text}</span>
      </span>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  helper,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
        {label}
      </label>

      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/30 focus:border-rose-400"
      />

      {helper && <p className="mt-1 text-xs font-semibold text-white/35">{helper}</p>}
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
}) {
  return (
    <div>
      <label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
        {label}
      </label>

      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/30 focus:border-rose-400"
      />

      {helper && <p className="mt-1 text-xs font-semibold text-white/35">{helper}</p>}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-xs font-black text-white/70">
      {children}
    </span>
  );
}

function PreviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
        {title}
      </p>
      <div className="mt-3 space-y-1">{children}</div>
    </div>
  );
}

function PreviewLine({ label, value }: { label: string; value?: string }) {
  return (
    <p className="text-sm text-white/60">
      <b className="text-white/80">{label}:</b> {value || "Not added"}
    </p>
  );
}
