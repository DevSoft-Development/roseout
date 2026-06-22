"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { clampScore } from "@/lib/clampScore";
import GoogleAddressAutocomplete, {
  type GoogleAddressFields,
} from "@/components/GoogleAddressAutocomplete";
import { getIsClaimed } from "@/lib/locationClaim";
import { getLocationScore } from "@/lib/locationScore";
import { supabase } from "@/lib/supabase";
import { formatFullAddress } from "@/lib/address-utils";
import LocationHoursEditor from "@/components/admin/LocationHoursEditor";
import LocationProfileEditor from "@/components/admin/LocationProfileEditor";

type LocationType = "restaurants" | "activities";
type PillTone = "neutral" | "success" | "warning" | "danger" | "dark";
type QualityStatus = "Excellent" | "Strong" | "Needs review" | "Incomplete";

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
  reservation_provider: string;
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
  google_regular_opening_hours?: unknown;
  hours_backfill_status?: string | null;
  hours_confidence?: string | null;
  hours_source?: string | null;
  hours_last_backfilled_at?: string | null;
  hours_backfill_error?: string | null;
  operating_hours_valid?: boolean;
  profile_managed_by?: string | null;
  profile_manual_lock?: boolean | null;
  profile_owner_verified_at?: string | null;
  profile_last_owner_update_at?: string | null;
  profile_last_admin_update_at?: string | null;
  profile_field_sources?: Record<string, unknown> | null;
};

type LocationRecord = Record<string, unknown> & {
  is_claimed?: boolean | null;
  claimed?: boolean | null;
  claim_status?: string | null;
  claimed_at?: string | null;
  claimed_by_email?: string | null;
  owner_user_id?: string | null;
};

const inputClass =
  "w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-black/75 shadow-sm outline-none transition placeholder:text-black/30 focus:border-[#ff1654]/50 focus:ring-4 focus:ring-[#ff1654]/10";
const selectClass = `${inputClass} appearance-none`;
const labelClass = "text-xs font-black uppercase tracking-[0.18em] text-black/45";

const navItems = [
  ["overview", "Overview"],
  ["contact", "Contact"],
  ["location-map", "Location & Map"],
  ["classification", "Classification"],
  ["search-tags", "Search & Tags"],
  ["photos", "Photos"],
  ["publishing", "Publishing"],
  ["ownership", "Ownership"],
  ["admin-notes", "Admin Notes"],
];

function normalizeLocationTypeParam(value: string): LocationType | null {
  if (value === "restaurants" || value === "restaurant") return "restaurants";
  if (value === "activities" || value === "activity" || value === "activitys") {
    return "activities";
  }

  return null;
}

function hasValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function getQualityStatus(score: number, readinessPercent: number): QualityStatus {
  if (score >= 90 && readinessPercent >= 85) return "Excellent";
  if (score >= 75 && readinessPercent >= 70) return "Strong";
  if (score >= 55) return "Needs review";

  return "Incomplete";
}

function getQualityStatusClass(status: QualityStatus) {
  switch (status) {
    case "Excellent":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Strong":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "Needs review":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "Incomplete":
      return "border-rose-200 bg-rose-50 text-rose-700";
  }
}

function calculateUpdatedScore(location: LocationRecord) {
  let score = 40;

  if (hasValue(location.description)) score += 8;
  if (hasValue(location.image_url)) score += 8;
  if (hasValue(location.website)) score += 4;
  if (
    hasValue(location.external_reservation_url) ||
    hasValue(location.reservation_url) ||
    hasValue(location.reservation_link)
  ) score += 5;
  if (hasValue(location.price_range)) score += 4;
  if (hasValue(location.atmosphere)) score += 6;
  if (hasValue(location.primary_tag)) score += 5;
  if (hasValue(location.date_style_tags)) score += 5;
  if (hasValue(location.best_for)) score += 5;
  if (hasValue(location.special_features)) score += 5;
  if (hasValue(location.search_keywords)) score += 5;
  if (hasValue(location.latitude) && hasValue(location.longitude)) score += 5;
  if (getIsClaimed(location)) score += 8;
  if (location.rating) score += Math.min(Number(location.rating) * 2, 10);

  return clampScore(score);
}

function serializeForm(form: FormState) {
  return JSON.stringify(form);
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
  const locationId = String(params.locationId || "");
  const from = searchParams.get("from") || "/admin/dashboard/locations";

  const table = type || "restaurants";
  const nameField = type === "activities" ? "activity_name" : "restaurant_name";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [message, setMessage] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [effectiveId, setEffectiveId] = useState(locationId);
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
    reservation_provider: "",
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
          `/api/locations/edit-context?type=${table}&id=${encodeURIComponent(locationId)}`,
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
        setEffectiveId(result.effectiveId || locationId);

        const nextForm: FormState = {
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
          reservation_provider: data.reservation_provider || "",
          phone: data.phone || "",
          price_range: data.price_range || "",
          cuisine: data.cuisine || "",
          activity_type: data.activity_type || "",
          atmosphere: data.atmosphere || "",
          noise_level: data.noise_level || "",
          dress_code: data.dress_code || "",
          parking_info: data.parking_info || "",
          operating_hours: data.operating_hours ?? null,
          google_regular_opening_hours: data.google_regular_opening_hours ?? null,
          hours_backfill_status: data.hours_backfill_status || null,
          hours_confidence: data.hours_confidence || null,
          hours_source: data.hours_source || null,
          hours_last_backfilled_at: data.hours_last_backfilled_at || null,
          hours_backfill_error: data.hours_backfill_error || null,
          operating_hours_valid: true,
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
          profile_managed_by: data.profile_managed_by || "system",
          profile_manual_lock: Boolean(data.profile_manual_lock),
          profile_owner_verified_at: data.profile_owner_verified_at || null,
          profile_last_owner_update_at: data.profile_last_owner_update_at || null,
          profile_last_admin_update_at: data.profile_last_admin_update_at || null,
          profile_field_sources: data.profile_field_sources && typeof data.profile_field_sources === "object" && !Array.isArray(data.profile_field_sources)
            ? data.profile_field_sources as Record<string, unknown>
            : null,
        };

        setForm(nextForm);
        setSavedSnapshot(serializeForm(nextForm));
      } catch {
        setMessage("Location failed to load.");
      } finally {
        setLoading(false);
      }
    };

    if (locationId && type) loadLocation();
  }, [locationId, type, table, nameField]);

  const update = (key: keyof FormState, value: string) => {
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

      setMessage("AI optimization applied. Review and save changes.");
    } catch {
      setMessage("AI optimization failed.");
    } finally {
      setOptimizing(false);
    }
  };

  const saveLocation = async () => {
    if (form.operating_hours_valid === false) {
      setMessage("Weekly Hours contains an invalid line. Fix the warning under Weekly Hours before saving.");
      return;
    }
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
      reservation_provider: form.reservation_provider || null,
      reservation_manual_override: true,
      reservation_discovery_status: "manual",
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
          id: effectiveId || locationId,
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

      const nextForm = {
        ...form,
        theouthaven_score: calculatedScore,
      };

      setForm(nextForm);
      setSavedSnapshot(serializeForm(nextForm));
      setMessage(`Saved successfully. TheOutHaven Score: ${calculatedScore}/100`);
    } catch {
      setMessage("Failed to save location.");
    } finally {
      setSaving(false);
    }
  };

  const safeScore = clampScore(form.theouthaven_score);
  const mainImage = form.main_image || form.image_url || "";
  const galleryImages = Array.from(new Set([mainImage, ...(form.images || [])].filter(Boolean))) as string[];
  const publicPreviewHref = `/locations/${type}/${effectiveId || locationId}`;
  const adminDetailHref = `/admin/dashboard/locations/${type}/${effectiveId || locationId}`;
  const crmHref = `/admin/dashboard/locations/${type}/${effectiveId || locationId}/crm`;
  const hasUnsavedChanges = savedSnapshot !== "" && serializeForm(form) !== savedSnapshot;
  const isSuccess =
    message.toLowerCase().includes("success") ||
    message.toLowerCase().includes("saved") ||
    message.toLowerCase().includes("applied");

  const readiness = useMemo(
    () => [
      ["Has name", hasValue(form.name)],
      ["Has full address", hasValue(form.address) || hasValue(form.formatted_address)],
      ["Has city/state/zip", hasValue(form.city) && hasValue(form.state) && hasValue(form.zip_code)],
      ["Has phone or website", hasValue(form.phone) || hasValue(form.website)],
      ["Has primary image", hasValue(mainImage)],
      ["Is approved", ["approved", "active", "published", "complete"].some((term) => `${form.data_status} ${form.claim_status}`.toLowerCase().includes(term))],
      ["Is searchable", form.is_searchable === "true" || form.is_searchable === ""],
      ["Has category/tags", hasValue(form.cuisine) || hasValue(form.activity_type) || hasValue(form.primary_tag) || hasValue(form.date_style_tags)],
      ["Has coordinates", hasValue(form.latitude) && hasValue(form.longitude)],
    ] as const,
    [form, mainImage]
  );
  const completedReadiness = readiness.filter(([, complete]) => complete).length;
  const readinessPercent = readiness.length
    ? Math.round((completedReadiness / readiness.length) * 100)
    : 0;
  const qualityStatus = getQualityStatus(safeScore, readinessPercent);
  const qualityStatusClass = getQualityStatusClass(qualityStatus);

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
    const path = `locations/${type}/${effectiveId || locationId}/${Date.now()}.${extension}`;
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
      setMessage("Image uploaded. Save changes to keep it on this listing.");
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

  if (!type) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0708] px-5 text-white">
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
      <main className="flex min-h-screen items-center justify-center bg-[#0b0708] pt-28 text-white">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.06] px-10 py-8 text-center shadow-2xl">
          <div className="mx-auto mb-5 h-12 w-12 animate-pulse rounded-full bg-[#ff1654] shadow-lg shadow-[#ff1654]/30" />
          <p className="text-sm font-black uppercase tracking-[0.3em] text-white/65">
            Loading Location
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b0708] px-4 pb-12 pt-24 text-white md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1560px] space-y-6">
        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-[#22070d] via-[#12090b] to-[#070707] p-5 shadow-2xl md:p-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => router.push(from)}
                className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/75 transition hover:bg-white hover:text-black"
              >
                Back to Locations
              </button>
              <p className="mt-6 text-xs font-black uppercase tracking-[0.35em] text-[#ff9bb6]">
                TheOutHaven Admin · Location Editor
              </p>
              <h1 className="mt-3 max-w-4xl truncate text-4xl font-black tracking-tight text-white md:text-5xl">
                {form.name || "Untitled Location"}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
                {formatFullAddress({
                  address: form.address,
                  city: form.city,
                  state: form.state,
                  zip_code: form.zip_code,
                  fallback: "",
                }) || "Address not added"}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <StatusPill tone="dark">{type === "restaurants" ? form.cuisine || "Restaurant" : form.activity_type || "Activity"}</StatusPill>
                <StatusPill tone={form.claim_status ? "success" : "warning"}>{form.claim_status || "Unclaimed"}</StatusPill>
                <StatusPill tone={form.data_status ? "success" : "neutral"}>{form.data_status || "Quality Review"}</StatusPill>
                <StatusPill tone={form.profile_manual_lock ? "success" : "neutral"}>
                  Profile source: {String(form.profile_managed_by || "system").replace(/_/g, " ")}
                </StatusPill>
                {form.profile_manual_lock ? <StatusPill tone="success">Manual lock</StatusPill> : null}
                {isImpersonating ? <StatusPill tone="dark">Admin View</StatusPill> : null}
              </div>
              <div className="mt-4 grid gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs font-bold text-white/60 sm:grid-cols-2 lg:grid-cols-4">
                <span>Manual lock: {form.profile_manual_lock ? "Yes" : "No"}</span>
                <span>Owner verified: {form.profile_owner_verified_at ? new Date(form.profile_owner_verified_at).toLocaleString() : "Not yet"}</span>
                <span>Last owner update: {form.profile_last_owner_update_at ? new Date(form.profile_last_owner_update_at).toLocaleString() : "—"}</span>
                <span>Last admin update: {form.profile_last_admin_update_at ? new Date(form.profile_last_admin_update_at).toLocaleString() : "—"}</span>
                <span>Hours source: {String(form.profile_field_sources?.operating_hours || form.hours_source || form.profile_managed_by || "system")}</span>
                <span>Contact source: {String(form.profile_field_sources?.phone || form.profile_field_sources?.website || form.profile_managed_by || "system")}</span>
                <span>Photos source: {String(form.profile_field_sources?.main_image || form.profile_field_sources?.images || form.profile_managed_by || "system")}</span>
                <span>Booking source: {String(form.profile_field_sources?.reservation_url || form.profile_field_sources?.booking_url || form.profile_managed_by || "system")}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <a href={publicPreviewHref} className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/80 transition hover:bg-white hover:text-black">
                View Public Page
              </a>
              <a href={crmHref} className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/80 transition hover:bg-white hover:text-black">
                Open CRM
              </a>
              <a href={adminDetailHref} className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/80 transition hover:bg-white hover:text-black">
                Legacy View
              </a>
              <button
                onClick={saveLocation}
                disabled={saving || optimizing}
                className="rounded-full bg-[#ff1654] px-6 py-3 text-sm font-black text-white shadow-lg shadow-[#ff1654]/25 transition hover:bg-[#d90046] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </section>

        <div className="sticky top-[72px] z-30 rounded-full border border-white/10 bg-[#12090b]/95 p-2 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 px-3">
              <p className="truncate text-sm font-black text-white">Editing {form.name || "location"}</p>
              <p className="text-xs font-bold text-white/45">{hasUnsavedChanges ? "Unsaved changes" : "All changes saved"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill tone={hasUnsavedChanges ? "warning" : "success"}>{hasUnsavedChanges ? "Draft" : "Saved"}</StatusPill>
              <button type="button" onClick={() => router.push(from)} className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/70 transition hover:bg-white hover:text-black">
                Cancel / Back
              </button>
              <button
                onClick={saveLocation}
                disabled={saving || optimizing}
                className="rounded-full bg-[#ff1654] px-5 py-2 text-xs font-black text-white transition hover:bg-[#d90046] disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>

        {message && (
          <div
            className={`rounded-[24px] border p-4 text-sm font-bold shadow-xl ${
              isSuccess
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                : "border-red-400/30 bg-red-400/10 text-red-100"
            }`}
          >
            {message}
          </div>
        )}


        <LocationProfileEditor
          table="locations"
          id={effectiveId || locationId}
          type={table}
          record={form as Record<string, unknown>}
          canEdit={!saving && !optimizing}
          canViewAdvancedSystemData={false}
          saveMode="owner"
          aiHelperEnabled={true}
          aiHelperAccessLabel="Availability depends on Admin Settings."
        />

        <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)_340px]">
          <aside className="xl:sticky xl:top-[152px] xl:self-start">
            <nav className="flex gap-2 overflow-x-auto rounded-[24px] border border-white/10 bg-white/[0.06] p-3 xl:grid xl:gap-2 xl:overflow-visible">
              {navItems.map(([href, label]) => (
                <a key={href} href={`#${href}`} className="shrink-0 rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white/55 transition hover:bg-white hover:text-black xl:w-full">
                  {label}
                </a>
              ))}
            </nav>
          </aside>

          <section className="space-y-6">
            <EditorSection id="overview" title="Overview" description="Core venue identity, public description, pricing, and website details.">
              <FieldRow columns={2}>
                <TextInput label="Location Name" value={form.name} onChange={(v) => update("name", v)} />
                <TextInput label="Website URL" value={form.website} onChange={(v) => update("website", v)} placeholder="https://..." />
              </FieldRow>
              <FieldRow columns={2}>
                {type === "restaurants" ? (
                  <TextInput label="Cuisine / Restaurant Type" value={form.cuisine} onChange={(v) => update("cuisine", v)} placeholder="Italian, Caribbean, Steakhouse" />
                ) : (
                  <TextInput label="Activity Type" value={form.activity_type} onChange={(v) => update("activity_type", v)} placeholder="Bowling, Museum, Spa, Lounge" />
                )}
                <TextInput label="Price Tier" value={form.price_range} onChange={(v) => update("price_range", v)} placeholder="$, $$, $$$" />
              </FieldRow>
              <TextArea label="Description" helper="Short, operator-quality copy used for the public listing and discovery surfaces." value={form.description} onChange={(v) => update("description", v)} />
            </EditorSection>

            <EditorSection id="contact" title="Contact" description="Customer contact, booking, reservations, and outbound destination URLs.">
              <FieldRow columns={2}>
                <TextInput label="Phone" value={form.phone} onChange={(v) => update("phone", v)} />
                <TextInput label="Reservation URL" value={form.reservation_url} onChange={(v) => update("reservation_url", v)} placeholder="https://..." />
              </FieldRow>
              <FieldRow columns={2}>
                <TextInput label="Booking URL" value={form.booking_url} onChange={(v) => update("booking_url", v)} placeholder="https://..." />
                <SelectInput label="Reservation Source" value={form.reservation_source} onChange={(v) => update("reservation_source", v)} options={["external", "internal", "both", "none"]} />
              </FieldRow>
              <TextInput label="Reservation Provider" value={form.reservation_provider} onChange={(v) => update("reservation_provider", v)} placeholder="OpenTable, Resy, SevenRooms, direct" />
              <FieldRow columns={2}>
                <ToggleRow title="Internal reservations" text="Allow this venue to use TheOutHaven reservation tools." checked={form.internal_reservations_enabled || form.uses_internal_reservations} onChange={setInternalReservations} />
                <ToggleRow title="External reservations" text="Keep outbound booking or reservation links enabled." checked={form.allow_external_reservations} onChange={setAllowExternalReservations} />
              </FieldRow>
            </EditorSection>

            <EditorSection id="location-map" title="Location & Map" description="Address intelligence, Google enrichment, and coordinate quality.">
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
                inputClassName={`mt-2 ${inputClass}`}
                labelClassName={labelClass}
                statusClassName="mt-2 text-xs font-bold text-black/45"
                dropdownClassName="absolute z-[999999] mt-2 w-full overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl"
                predictionButtonClassName="block w-full border-b border-black/10 px-4 py-3 text-left text-sm font-bold text-black/70 transition last:border-b-0 hover:bg-[#fff1f5]"
                buttonClassName="mt-3 rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-black text-black/65 transition hover:bg-[#ff1654] hover:text-white disabled:opacity-50"
              />
              <FieldRow columns={4}>
                <TextInput label="City" value={form.city} onChange={(v) => update("city", v)} />
                <TextInput label="State" value={form.state} onChange={(v) => update("state", v)} />
                <TextInput label="Zip" value={form.zip_code} onChange={(v) => update("zip_code", v)} />
                <TextInput label="Neighborhood" value={form.neighborhood} onChange={(v) => update("neighborhood", v)} />
              </FieldRow>
              <TextInput label="Formatted Address" value={form.formatted_address} onChange={(v) => update("formatted_address", v)} />
              <FieldRow columns={3}>
                <TextInput label="Latitude" value={String(form.latitude || "")} onChange={(v) => update("latitude", v)} />
                <TextInput label="Longitude" value={String(form.longitude || "")} onChange={(v) => update("longitude", v)} />
                <TextInput label="Google Place ID" value={form.google_place_id} onChange={(v) => update("google_place_id", v)} />
              </FieldRow>
            </EditorSection>

            <EditorSection id="classification" title="Classification" description="Venue taxonomy, atmosphere, feature tags, and discovery positioning.">
              <FieldRow columns={2}>
                <TextInput label="Primary Tag" value={form.primary_tag} onChange={(v) => update("primary_tag", v)} placeholder="Romantic, Trendy, Cozy, Upscale" />
                <TextInput label="Date Style Tags" value={form.date_style_tags} onChange={(v) => update("date_style_tags", v)} placeholder="Comma-separated tags" />
              </FieldRow>
              <FieldRow columns={2}>
                <TextInput label="Atmosphere / Ambience" value={form.atmosphere} onChange={(v) => update("atmosphere", v)} />
                <TextInput label="Noise Level" value={form.noise_level} onChange={(v) => update("noise_level", v)} />
              </FieldRow>
              <FieldRow columns={2}>
                <TextInput label="Dress Code" value={form.dress_code} onChange={(v) => update("dress_code", v)} />
                <TextInput label="Parking Info" value={form.parking_info} onChange={(v) => update("parking_info", v)} />
              </FieldRow>
              <TextArea label="Good For" value={form.best_for} onChange={(v) => update("best_for", v)} helper="Comma-separated situations, audiences, or occasions." />
              <TextArea label="Feature Tags" value={form.special_features} onChange={(v) => update("special_features", v)} helper="Comma-separated venue features." />
              <TextArea label="Signature Items" value={form.signature_items} onChange={(v) => update("signature_items", v)} helper="Food, drinks, amenities, or notable experiences." />
            </EditorSection>

            <EditorSection id="search-tags" title="Search & Tags" description="Internal search quality controls and discovery keywords.">
              <TextArea label="Search Keywords" value={form.search_keywords} onChange={(v) => update("search_keywords", v)} helper="Comma-separated keywords used by search and recommendations." />
              <FieldRow columns={3}>
                <SelectInput label="Searchable" value={form.is_searchable || ""} onChange={(v) => update("is_searchable", v)} options={["", "true", "false"]} optionLabels={{ "": "Use default", true: "Searchable", false: "Hidden from search" }} />
                <TextInput label="Quality Status" value={form.data_status || ""} onChange={(v) => update("data_status", v)} />
                <TextInput label="Missing Fields" value={form.missing_fields || ""} onChange={(v) => update("missing_fields", v)} />
              </FieldRow>
            </EditorSection>

            <EditorSection id="photos" title="Photos" description="Primary image, gallery URLs, and lightweight upload/backfill tools.">
              <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                <div className="overflow-hidden rounded-[20px] border border-black/10 bg-white shadow-sm">
                  {mainImage ? (
                    <Image src={mainImage} alt={form.name || "Location"} width={420} height={300} className="h-40 w-full object-cover" />
                  ) : (
                    <div className="flex h-40 items-center justify-center bg-black/[0.04] text-xs font-black uppercase tracking-[0.18em] text-black/35">Missing photo</div>
                  )}
                </div>
                <TextInput label="Primary Image URL" value={mainImage} onChange={setMainImage} helper="Saved to main_image and image_url for compatibility." />
              </div>

              <div className="rounded-[20px] border border-black/10 bg-white p-4">
                <label className={labelClass}>Upload image</label>
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingImage}
                  onChange={(event) => uploadGalleryImage(event.target.files?.[0] || null)}
                  className="mt-2 block w-full rounded-2xl border border-black/10 bg-[#fffaf6] px-4 py-3 text-sm font-semibold text-black/70 file:mr-4 file:rounded-full file:border-0 file:bg-[#ff1654] file:px-4 file:py-2 file:text-xs file:font-black file:text-white disabled:opacity-50"
                />
                <p className="mt-2 text-xs font-semibold text-black/40">If the storage bucket is not available, paste an image URL instead.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <TextInput label="Add Gallery Image URL" value={newGalleryImage} onChange={setNewGalleryImage} placeholder="https://..." />
                <button type="button" onClick={addGalleryImage} className="self-end rounded-full bg-[#ff1654] px-5 py-3 text-xs font-black uppercase tracking-wide text-white transition hover:bg-[#d90046]">Add image</button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {(galleryImages.length ? galleryImages : [""]).slice(0, 9).map((image, index) => (
                  <div key={`${image}-${index}`} className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
                    {image ? <Image src={image} alt={`Gallery ${index + 1}`} width={260} height={180} className="h-28 w-full object-cover" /> : <div className="flex h-28 items-center justify-center text-xs font-bold text-black/30">Gallery preview</div>}
                    <div className="space-y-2 p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-black/45">{image === mainImage ? "Main image" : `Photo ${index + 1}`}</div>
                      {image && (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setMainImage(image)} className="flex-1 rounded-full border border-black/10 px-3 py-1.5 text-[10px] font-black uppercase text-black/60 hover:bg-black hover:text-white">Set main</button>
                          <button type="button" onClick={() => removeGalleryImage(image)} className="flex-1 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-black uppercase text-red-700 hover:bg-red-600 hover:text-white">Remove</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </EditorSection>

            <EditorSection id="publishing" title="Publishing" description="Controls that influence public visibility, reservations, and live listing readiness.">
              <FieldRow columns={2}>
                <ToggleRow title="Internal reservations" text="Enable TheOutHaven reservation operations." checked={form.internal_reservations_enabled || form.uses_internal_reservations} onChange={setInternalReservations} />
                <ToggleRow title="External reservations" text="Allow external booking URLs to remain available." checked={form.allow_external_reservations} onChange={setAllowExternalReservations} />
              </FieldRow>
              <FieldRow columns={2}>
                <SelectInput label="Reservation Source" value={form.reservation_source} onChange={(v) => update("reservation_source", v)} options={["external", "internal", "both", "none"]} />
                <SelectInput label="Searchable" value={form.is_searchable || ""} onChange={(v) => update("is_searchable", v)} options={["", "true", "false"]} optionLabels={{ "": "Use default", true: "Searchable", false: "Hidden from search" }} />
              </FieldRow>
              <TextInput label="Hours" value={form.hours || ""} onChange={(v) => update("hours", v)} placeholder="Mon-Fri 5pm-10pm" />
              <LocationHoursEditor value={form.operating_hours} theme="light" status={form as Record<string, unknown>} onValidJsonChange={(value, valid) => setForm((prev) => ({ ...prev, operating_hours: value, operating_hours_valid: valid }))} />
              <details className="rounded-2xl border border-black/10 bg-white p-4 text-sm font-bold text-black/65"><summary className="cursor-pointer">Special/Holiday Hours JSON</summary><textarea readOnly rows={5} value={form.special_hours ? JSON.stringify(form.special_hours, null, 2) : ""} className="mt-3 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 font-mono text-xs text-black outline-none" /></details>
              {type === "restaurants" ? (
                <FieldRow columns={2}>
                  <TextInput label="Days of Operation" value={(form.days_of_operation || []).join(", ")} onChange={(v) => setForm((prev) => ({ ...prev, days_of_operation: toArray(v) }))} />
                  <TextInput label="Kitchen Closing Time" value={form.kitchen_closing_time || ""} onChange={(v) => setForm((prev) => ({ ...prev, kitchen_closing_time: v }))} />
                </FieldRow>
              ) : null}
            </EditorSection>

            <EditorSection id="ownership" title="Ownership" description="Owner contact data and claim status used by admin operations.">
              <FieldRow columns={3}>
                <TextInput label="Owner Name" value={form.owner_name} onChange={(v) => update("owner_name", v)} />
                <TextInput label="Owner Email" value={form.owner_email} onChange={(v) => update("owner_email", v)} />
                <TextInput label="Owner Phone" value={form.owner_phone} onChange={(v) => update("owner_phone", v)} />
              </FieldRow>
              <FieldRow columns={2}>
                <TextInput label="Claim Status" value={form.claim_status} onChange={(v) => update("claim_status", v)} />
                <ReadOnlyField label="Claim Summary" value={form.claim_status || "Unclaimed or not connected"} />
              </FieldRow>
              <a href={crmHref} className="inline-flex w-fit rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-black text-black/65 transition hover:bg-black hover:text-white">Open CRM / Claim Management</a>
            </EditorSection>

            <EditorSection id="admin-notes" title="Admin Notes" description="Operational context and read-only quality signals for staff review.">
              <FieldRow columns={3}>
                <MetricCard label="TheOutHaven Score" value={`${safeScore}/100`} />
                <MetricCard label="Effective ID" value={effectiveId || locationId} />
                <MetricCard label="Source" value={type === "restaurants" ? "Restaurants" : "Activities"} />
              </FieldRow>
              <TextArea label="Data Quality Notes" value={form.missing_fields || ""} onChange={(v) => update("missing_fields", v)} helper="Stored in the existing missing_fields value when present." />
            </EditorSection>
          </section>

          <aside className="space-y-4 xl:sticky xl:top-[96px] xl:self-start">
            <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#fffaf6] text-[#1f1713] shadow-2xl">
              {mainImage ? (
                <Image
                  src={mainImage}
                  alt={form.name || "Location preview"}
                  width={700}
                  height={420}
                  className="h-56 w-full object-cover"
                />
              ) : (
                <div className="flex h-56 items-center justify-center bg-black/[0.04] text-sm font-black uppercase tracking-[0.18em] text-black/35">
                  No image preview
                </div>
              )}

              <div className="p-5">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-black/40">
                  Live Summary
                </p>
                <h2 className="mt-2 text-2xl font-black">
                  {form.name || "Location Name"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-black/55">
                  {[form.address, form.city, form.state, form.zip_code]
                    .filter(Boolean)
                    .join(", ") || "Address will appear here"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusPill>{type === "restaurants" ? form.cuisine || "Restaurant" : form.activity_type || "Activity"}</StatusPill>
                  <StatusPill tone={form.claim_status ? "success" : "warning"}>{form.claim_status || "Unclaimed"}</StatusPill>
                  <StatusPill tone={form.is_searchable === "false" ? "danger" : "success"}>{form.is_searchable === "false" ? "Not searchable" : "Searchable"}</StatusPill>
                </div>
              </div>
            </div>

            <section className="rounded-[24px] border border-black/10 bg-[#fffaf6] p-5 text-[#1f1713] shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-[#1f1713]">Location Quality</h3>
                  <p className="mt-1 text-sm font-medium leading-5 text-black/50">
                    Operational readiness for search, publishing, and booking workflows.
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-black ${qualityStatusClass}`}>
                  {qualityStatus}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-black/10 bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-black/40">
                    Readiness
                  </p>
                  <div className="mt-2 flex items-end gap-1">
                    <span className="text-2xl font-black text-[#1f1713]">{completedReadiness}</span>
                    <span className="pb-1 text-xs font-bold text-black/45">of {readiness.length}</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-black/10 bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-black/40">
                    Quality Score
                  </p>
                  <div className="mt-2 flex items-end gap-1">
                    <span className="text-2xl font-black text-[#1f1713]">{safeScore}</span>
                    <span className="pb-1 text-xs font-bold text-black/45">/100</span>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-black/55">Completion</span>
                  <span className="text-xs font-black text-black/65">{readinessPercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/10">
                  <div
                    className="h-full rounded-full bg-[#ff1654]"
                    style={{ width: `${readinessPercent}%` }}
                  />
                </div>
              </div>

              <p className="mt-4 text-sm font-medium leading-5 text-black/50">
                This location is evaluated for listing completeness, search visibility, media, contact details, and admin approval.
              </p>

              <div className="mt-5 space-y-2">
                {readiness.map(([label, complete]) => (
                  <div key={label} className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3">
                    <span className="text-sm font-bold text-black/65">{label}</span>
                    <span className={`h-2.5 w-2.5 rounded-full ${complete ? "bg-emerald-500" : "bg-amber-400"}`} />
                  </div>
                ))}
              </div>
            </section>

            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="Score" value={`${safeScore}`} dark />
              <MetricCard label="Photos" value={String(galleryImages.length)} dark />
              <MetricCard label="Tags" value={String(toArray(form.date_style_tags).length + (form.primary_tag ? 1 : 0))} dark />
              <MetricCard label="Claim" value={form.claim_status || "Open"} dark />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function EditorSection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-36 rounded-[24px] border border-black/10 bg-[#fffaf6] p-5 text-[#1f1713] shadow-sm md:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-black text-[#1f1713]">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-black/55">{description}</p> : null}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function FieldRow({ children, columns = 2 }: { children: ReactNode; columns?: 2 | 3 | 4 }) {
  const cols = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-4",
  }[columns];

  return <div className={`grid gap-4 ${cols}`}>{children}</div>;
}

function TextInput({
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
    <label className="grid gap-2">
      <span className={labelClass}>{label}</span>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
      {helper ? <span className="text-xs font-semibold text-black/40">{helper}</span> : null}
    </label>
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
    <label className="grid gap-2">
      <span className={labelClass}>{label}</span>
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className={`${inputClass} resize-none`}
      />
      {helper ? <span className="text-xs font-semibold text-black/40">{helper}</span> : null}
    </label>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
  optionLabels,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  optionLabels?: Record<string, string>;
}) {
  return (
    <label className="grid gap-2">
      <span className={labelClass}>{label}</span>
      <select value={value || ""} onChange={(event) => onChange(event.target.value)} className={selectClass}>
        {options.map((option) => (
          <option key={option || "default"} value={option}>
            {optionLabels?.[option] || option || "Use default"}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2">
      <span className={labelClass}>{label}</span>
      <div className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-black/55 shadow-sm">
        {value}
      </div>
    </div>
  );
}

function ToggleRow({
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
    <label className="flex cursor-pointer items-start gap-4 rounded-[20px] border border-black/10 bg-white p-4 shadow-sm transition hover:border-[#ff1654]/30">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 accent-[#ff1654]"
      />
      <span>
        <span className="block text-sm font-black text-[#1f1713]">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-black/45">{text}</span>
      </span>
    </label>
  );
}

function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: PillTone }) {
  const tones: Record<PillTone, string> = {
    neutral: "border-black/10 bg-black/[0.04] text-black/65",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    danger: "border-red-200 bg-red-50 text-red-700",
    dark: "border-white/10 bg-white/10 text-white",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${tones[tone]}`}>
      {children}
    </span>
  );
}

function MetricCard({ label, value, dark = false }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className={dark ? "rounded-[22px] border border-white/10 bg-white/[0.06] p-4 text-white shadow-xl" : "rounded-[20px] border border-black/10 bg-white p-4 shadow-sm"}>
      <p className={dark ? "text-[10px] font-black uppercase tracking-[0.18em] text-white/40" : "text-[10px] font-black uppercase tracking-[0.18em] text-black/40"}>{label}</p>
      <p className={dark ? "mt-2 truncate text-xl font-black text-white" : "mt-2 truncate text-xl font-black text-[#1f1713]"}>{value || "—"}</p>
    </div>
  );
}
