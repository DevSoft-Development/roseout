"use client";

import Image from "next/image";
import Link from "next/link";
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
import { buildLocationEditorLinks } from "@/lib/location-editor-links";

type LocationType = "restaurants" | "activities";
type PillTone = "neutral" | "success" | "warning" | "danger" | "dark";

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
  logo_url?: string | null;
  brand_logo_url?: string | null;
  location_logo_url?: string | null;
  profile_logo_url?: string | null;
  owner_logo_url?: string | null;
};

type LocationRecord = Record<string, unknown> & {
  is_claimed?: boolean | null;
  claimed?: boolean | null;
  claim_status?: string | null;
  claimed_at?: string | null;
  claimed_by_email?: string | null;
  owner_user_id?: string | null;
};

const panelClass =
  "rounded-[28px] border border-white/10 bg-[#0c1017] shadow-[0_24px_80px_rgba(0,0,0,0.35)]";
const panelHeaderClass = "border-b border-white/10 px-6 py-5";
const fieldClass =
  "w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:border-[#e1062a]/70 focus:ring-4 focus:ring-[#e1062a]/10";
const inputClass = fieldClass;
const selectClass = `${fieldClass} appearance-none`;
const labelClass = "text-xs font-black uppercase tracking-[0.18em] text-white/45";
const secondaryButtonClass =
  "rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-wide text-white/70 transition hover:bg-white/[0.08] hover:text-white";

const dashboardTabs = [
  { label: "Details", href: "#details" },
  { label: "Public Profile", href: "#public-profile" },
  { label: "Photos", href: "#photos" },
  { label: "Hours", href: "#hours" },
  { label: "Reservations", href: "#reservations" },
  { label: "QR Codes", href: "/business/dashboard/qr-codes" },
  { label: "Analytics", href: "/business/dashboard/analytics" },
  { label: "Menu", href: "/business/dashboard/menu" },
];

function getInitials(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  if (!words.length) return "OH";
  return words.slice(0, 3).map((word) => word[0]?.toUpperCase()).join("");
}

function publicStatusLabel(form: FormState) {
  if (String(form.data_status || "").toLowerCase().includes("review")) return "Needs Review";
  if (form.is_searchable === "false") return "Hidden";
  if (["approved", "active", "published", "complete"].some((term) => String(form.data_status || "").toLowerCase().includes(term))) return "Published";
  return "Draft";
}

function searchVisibilityLabel(value: unknown) {
  if (value === "true" || value === true) return "Searchable";
  if (value === "false" || value === false) return "Hidden from search";
  return "Default visibility";
}

function reservationsLabel(form: FormState) {
  if (form.reservation_source === "both") return "Internal + external";
  if (form.internal_reservations_enabled || form.uses_internal_reservations) return "Internal enabled";
  if (form.allow_external_reservations || form.reservation_url || form.booking_url) return "External enabled";
  return "Not configured";
}


function getLogoUrl(formOrLocation: FormState) {
  return (
    formOrLocation.logo_url ||
    formOrLocation.brand_logo_url ||
    formOrLocation.location_logo_url ||
    formOrLocation.profile_logo_url ||
    formOrLocation.owner_logo_url ||
    ""
  );
}
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

function humanizeValue(value: unknown, fallback = "Not set") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : fallback;
  if (typeof value === "object") return fallback;
  return String(value).replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function managedByLabel(value: unknown) {
  const key = String(value || "system").toLowerCase();
  if (key === "owner") return "Owner managed";
  if (key === "admin") return "Admin managed";
  if (key === "system") return "System imported";
  return humanizeValue(value);
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
  const [message, setMessage] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [canonicalId, setCanonicalId] = useState(locationId);
  const [sourceId, setSourceId] = useState<string | null>(null);
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

        const nextCanonicalId = result.canonicalId || data.canonical_location_id || null;
        const nextSourceId = result.sourceId || data.legacy_source_id || data.source_id || null;

        setCanonicalId(nextCanonicalId ? String(nextCanonicalId) : "");
        setSourceId(nextSourceId ? String(nextSourceId) : null);
        setEffectiveId(String(result.effectiveId || nextCanonicalId || nextSourceId || locationId));

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
      is_searchable: form.is_searchable === "" ? null : form.is_searchable === "true",
      data_status: form.data_status || null,
      missing_fields: toArray(form.missing_fields || ""),
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
          id: canonicalId || effectiveId || locationId,
          payload,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setMessage(result.error || "Failed to save location.");
        setSaving(false);
        return;
      }

      if (result.canonicalId) setCanonicalId(String(result.canonicalId));
      if ("sourceId" in result) setSourceId(result.sourceId ? String(result.sourceId) : null);
      setEffectiveId(String(result.canonicalId || result.effectiveId || result.sourceId || effectiveId));

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
  const links = buildLocationEditorLinks({
    type: table as LocationType,
    locationId,
    canonicalId: canonicalId || undefined,
    sourceId,
    effectiveId,
  });
  const publicPreviewHref = links.publicPage;
  const adminDetailHref = links.dashboard;
  const crmHref = links.crm;
  const reservationsHref = links.reservations;
  const tabs = dashboardTabs.map((tab) => {
    if (tab.label === "Reservations") return { ...tab, href: links.reservations };
    if (tab.label === "QR Codes") return { ...tab, href: links.qrTools };
    if (tab.label === "Analytics") return { ...tab, href: links.analytics };
    if (tab.label === "Menu") return { ...tab, href: links.menuEditor };
    return tab;
  });
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
    const uploadLocationId = canonicalId || effectiveId || locationId;
    const path = `locations/${type}/${uploadLocationId}/${Date.now()}.${extension}`;
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
      <main className="flex min-h-screen items-center justify-center bg-[#07090d] px-5 text-white">
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
      <main className="flex min-h-screen items-center justify-center bg-[#050607] text-white">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.06] px-10 py-8 text-center shadow-2xl">
          <div className="mx-auto mb-5 h-12 w-12 animate-pulse rounded-full bg-[#e1062a] shadow-lg shadow-[#ff1654]/30" />
          <p className="text-sm font-black uppercase tracking-[0.3em] text-white/65">
            Loading Location
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050607] text-white">
      <EditorSidebar links={links} />
      <section className="min-h-screen xl:pl-[256px]">
        <div className="sticky top-0 z-30 border-b border-white/10 bg-[#050607]/95 backdrop-blur-xl">
          <div className="flex flex-col gap-4 px-4 py-4 md:px-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <button className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-xl font-black text-white/80" aria-label="Open menu">☰</button>
              <div className="min-w-0">
                <p className="truncate text-xs font-black uppercase tracking-[0.22em] text-white/40">
                  Locations &gt; {type === "restaurants" ? "Restaurants" : "Activities"} &gt; {form.name || "Location"}
                </p>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-white md:text-3xl">Location Editor</h1>
                <p className="mt-1 text-sm font-semibold text-white/45">Update your location details, settings, and preferences.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => router.push(from)} className={secondaryButtonClass}>Cancel</button>
              <Link href={publicPreviewHref} className={secondaryButtonClass}>Preview</Link>
              <button onClick={saveLocation} disabled={saving} className="rounded-full bg-gradient-to-r from-[#e1062a] to-[#ff2142] px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-[#ff1654]/25 transition hover:bg-[#ff2142] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving..." : "Save Changes"}</button>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black uppercase tracking-wide text-white/45">{saving ? "Saving..." : hasUnsavedChanges ? "Draft changes" : "All changes saved"}</span>
              <button className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-xl font-black text-white/70" aria-label="More actions">⋯</button>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto px-4 pb-4 md:px-6">
            {tabs.map((tab) => (
              tab.href ? (
                <Link key={tab.label} href={tab.href} className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white/55 transition hover:bg-white/[0.08] hover:text-white first:border-[#ff1654]/50 first:bg-[#ff1654]/10 first:text-white">{tab.label}</Link>
              ) : (
                <button key={tab.label} type="button" disabled className="shrink-0 rounded-full border border-white/10 bg-white/[0.02] px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white/25">{tab.label}</button>
              )
            ))}
          </div>
        </div>

        <div className="mx-auto max-w-[1560px] space-y-6 px-4 py-6 md:px-6">
          {message && (
            <div className={`rounded-[24px] border p-4 text-sm font-bold shadow-xl ${isSuccess ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : "border-red-400/30 bg-red-400/10 text-red-100"}`}>
              {message}
            </div>
          )}

          {!links.hasCanonicalId ? (
            <div className="mb-5 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-5 py-4 text-sm font-bold leading-6 text-amber-100">
              Dashboard tools need a canonical locations row. This editor loaded from the legacy restaurant/activity table, so dashboard links may not work until this location is repaired.
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
            <section id="details" className="space-y-6">
              <EditorSection id="basic-information" title="Basic Information" description="Core public identity and discovery copy.">
                <FieldRow columns={2}>
                  <TextInput label="Location Name" value={form.name} onChange={(v) => update("name", v)} />
                  {type === "restaurants" ? <TextInput label="Cuisine / Restaurant Type" value={form.cuisine} onChange={(v) => update("cuisine", v)} /> : <TextInput label="Activity Type" value={form.activity_type} onChange={(v) => update("activity_type", v)} />}
                </FieldRow>
                <FieldRow columns={2}>
                  <TextInput label="Price Tier" value={form.price_range} onChange={(v) => update("price_range", v)} placeholder="$, $$, $$$" />
                  <TextInput label="Primary Tag" value={form.primary_tag} onChange={(v) => update("primary_tag", v)} />
                </FieldRow>
                <TextArea label="Description" value={form.description} onChange={(v) => update("description", v)} />
                <TextArea label="Search Keywords" value={form.search_keywords} onChange={(v) => update("search_keywords", v)} helper="Comma-separated keywords." />
              </EditorSection>

              <EditorSection id="contact-information" title="Contact Information" description="Customer contact, booking, CRM, and public links.">
                <FieldRow columns={2}>
                  <TextInput label="Phone" value={form.phone} onChange={(v) => update("phone", v)} />
                  <TextInput label="Website URL" value={form.website} onChange={(v) => update("website", v)} placeholder="https://..." />
                </FieldRow>
                <FieldRow columns={2}>
                  <TextInput label="Reservation URL" value={form.reservation_url} onChange={(v) => update("reservation_url", v)} placeholder="https://..." />
                  <TextInput label="Booking URL" value={form.booking_url} onChange={(v) => update("booking_url", v)} placeholder="https://..." />
                </FieldRow>
                <div className="flex flex-wrap gap-3">
                  <Link href={crmHref} title={dashboardRepairTitle(links)} className={`${secondaryButtonClass}${dashboardRepairClass(links)}`}>Open CRM</Link>
                  <Link href={adminDetailHref} title={dashboardRepairTitle(links)} className={`${secondaryButtonClass}${dashboardRepairClass(links)}`}>Back to Location Dashboard</Link>
                </div>
              </EditorSection>

              <EditorSection id="address" title="Address" description="Address intelligence, coordinates, and Google enrichment.">
                <GoogleAddressAutocomplete label="Address" value={form.address} address={form.address} city={form.city} state={form.state} zip_code={form.zip_code} neighborhood={form.neighborhood} latitude={form.latitude} longitude={form.longitude} google_place_id={form.google_place_id} formatted_address={form.formatted_address} isAdmin={from.startsWith("/admin")} showCoordinateRepairTools={from.startsWith("/admin")} onAddressChange={(value) => update("address", value)} onAddressSelect={(selected: GoogleAddressFields) => setForm((prev) => ({ ...prev, ...selected }))} inputClassName={`mt-2 ${inputClass}`} labelClassName={labelClass} statusClassName="mt-2 text-xs font-bold text-white/45" dropdownClassName="absolute z-[999999] mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#121721] shadow-2xl" predictionButtonClassName="block w-full border-b border-white/10 px-4 py-3 text-left text-sm font-bold text-white/70 transition last:border-b-0 hover:bg-white/[0.08]" buttonClassName="mt-3 rounded-full border border-white/10 bg-[#121721] px-4 py-2 text-xs font-black text-white/65 transition hover:bg-[#e1062a] hover:text-white disabled:opacity-50" />
                <FieldRow columns={4}><TextInput label="City" value={form.city} onChange={(v) => update("city", v)} /><TextInput label="State" value={form.state} onChange={(v) => update("state", v)} /><TextInput label="Zip" value={form.zip_code} onChange={(v) => update("zip_code", v)} /><TextInput label="Neighborhood" value={form.neighborhood} onChange={(v) => update("neighborhood", v)} /></FieldRow>
                <FieldRow columns={3}><TextInput label="Latitude" value={String(form.latitude || "")} onChange={(v) => update("latitude", v)} /><TextInput label="Longitude" value={String(form.longitude || "")} onChange={(v) => update("longitude", v)} /><TextInput label="Google Place ID" value={form.google_place_id} onChange={(v) => update("google_place_id", v)} /></FieldRow>
              </EditorSection>

              <EditorSection id="classification" title="Classification" description="Discovery filters and audience fit.">
                <FieldRow columns={3}><TextInput label="Atmosphere" value={form.atmosphere} onChange={(v) => update("atmosphere", v)} /><TextInput label="Best For" value={form.best_for} onChange={(v) => update("best_for", v)} /><TextInput label="Date Style Tags" value={form.date_style_tags} onChange={(v) => update("date_style_tags", v)} /></FieldRow>
                <FieldRow columns={3}><TextInput label="Noise Level" value={form.noise_level} onChange={(v) => update("noise_level", v)} /><TextInput label="Dress Code" value={form.dress_code} onChange={(v) => update("dress_code", v)} /><TextInput label="Parking Info" value={form.parking_info} onChange={(v) => update("parking_info", v)} /></FieldRow>
                <FieldRow columns={2}><TextInput label="Signature Items" value={form.signature_items} onChange={(v) => update("signature_items", v)} /><TextInput label="Special Features" value={form.special_features} onChange={(v) => update("special_features", v)} /></FieldRow>
              </EditorSection>

              <EditorSection id="hours" title="Hours" description="Weekly hours, short display hours, and source confidence.">
                <TextInput label="Hours" value={form.hours || ""} onChange={(v) => update("hours", v)} placeholder="Mon-Fri 5pm-10pm" />
                <LocationHoursEditor value={form.operating_hours} theme="dark" status={form as Record<string, unknown>} onValidJsonChange={(value, valid) => setForm((prev) => ({ ...prev, operating_hours: value, operating_hours_valid: valid }))} />
                <FieldRow columns={3}><ReadOnlyField label="Hours Source" value={humanizeValue(form.hours_source)} /><ReadOnlyField label="Hours Confidence" value={humanizeValue(form.hours_confidence)} /><ReadOnlyField label="Backfill Status" value={humanizeValue(form.hours_backfill_status)} /></FieldRow>
              </EditorSection>

              <EditorSection id="reservations" title="Reservations" description="Internal and external reservation settings.">
                <FieldRow columns={2}><ToggleRow title="Internal reservations" text="Enable TheOutHaven reservation operations." checked={form.internal_reservations_enabled || form.uses_internal_reservations} onChange={setInternalReservations} /><ToggleRow title="External reservations" text="Allow outbound booking links." checked={form.allow_external_reservations} onChange={setAllowExternalReservations} /></FieldRow>
                <FieldRow columns={3}><SelectInput label="Reservation Source" value={form.reservation_source} onChange={(v) => update("reservation_source", v)} options={["external", "internal", "both", "none"]} /><SelectInput label="Search visibility" value={form.is_searchable || ""} onChange={(v) => update("is_searchable", v)} options={["", "true", "false"]} optionLabels={{ "": "Using default visibility", true: "Searchable", false: "Hidden from search" }} /><TextInput label="Quality Status" value={form.data_status || ""} onChange={(v) => update("data_status", v)} /></FieldRow>
                </EditorSection>

              <EditorSection id="photos" title="Photos" description="Main image, gallery images, and media upload.">
                <p className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-xs font-bold text-white/45">Location logo editing is not shown because no supported logo field is exposed in the current edit API/state.</p>
                <FieldRow columns={2}><TextInput label="Primary Image URL" value={mainImage} onChange={setMainImage} /><TextInput label="Add Gallery Image URL" value={newGalleryImage} onChange={setNewGalleryImage} placeholder="https://..." /></FieldRow>
                <div className="flex flex-wrap gap-3"><button type="button" onClick={addGalleryImage} className={secondaryButtonClass}>Add Image</button><label className={`${secondaryButtonClass} cursor-pointer`}>Upload Image<input type="file" accept="image/*" disabled={uploadingImage} onChange={(event) => uploadGalleryImage(event.target.files?.[0] || null)} className="sr-only" /></label><Link href={reservationsHref} className={secondaryButtonClass}>Reservations</Link></div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(galleryImages.length ? galleryImages : [""]).slice(0, 6).map((image, index) => (
                    <div key={`${image}-${index}`} className="overflow-hidden rounded-2xl border border-white/10 bg-[#121721]">
                      {image ? <Image src={image} alt={`Gallery ${index + 1}`} width={260} height={160} className="h-24 w-full object-cover" unoptimized /> : <div className="flex h-24 items-center justify-center text-xs font-bold text-white/30">Gallery preview</div>}
                      {image ? <div className="grid grid-cols-2 gap-2 p-2"><button type="button" onClick={() => setMainImage(image)} className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-black uppercase text-white/60 hover:bg-white/[0.08]">Set main</button><button type="button" onClick={() => removeGalleryImage(image)} className="rounded-full border border-red-400/30 px-2 py-1 text-[10px] font-black uppercase text-red-200 hover:bg-red-500/20">Remove</button></div> : null}
                    </div>
                  ))}
                </div>
              </EditorSection>

              <EditorSection id="public-profile" title="Public Profile / Publishing" description="Visibility, search readiness, and publish checklist.">
                <FieldRow columns={3}><SelectInput label="Search visibility" value={form.is_searchable || ""} onChange={(v) => update("is_searchable", v)} options={["", "true", "false"]} optionLabels={{ "": "Using default visibility", true: "Searchable", false: "Hidden from search" }} /><TextInput label="Data Status" value={form.data_status || ""} onChange={(v) => update("data_status", v)} /><ReadOnlyField label="Public Status" value={publicStatusLabel(form)} /></FieldRow>
                <div className="flex flex-wrap gap-2">{readiness.map(([label, complete]) => <span key={label} className={`rounded-full border px-3 py-1 text-xs font-black ${complete ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : "border-amber-400/30 bg-amber-400/10 text-amber-100"}`}>{complete ? "✓" : "!"} {label}</span>)}</div>
              </EditorSection>

              <EditorSection id="ownership" title="Ownership" description="Owner and claim management metadata.">
                <FieldRow columns={3}><TextInput label="Owner Name" value={form.owner_name} onChange={(v) => update("owner_name", v)} /><TextInput label="Owner Email" value={form.owner_email} onChange={(v) => update("owner_email", v)} /><TextInput label="Owner Phone" value={form.owner_phone} onChange={(v) => update("owner_phone", v)} /></FieldRow>
                <FieldRow columns={3}><TextInput label="Claim Status" value={form.claim_status} onChange={(v) => update("claim_status", v)} /><ReadOnlyField label="Managed By" value={managedByLabel(form.profile_managed_by)} /><ReadOnlyField label="Manual Lock" value={form.profile_manual_lock ? "Locked" : "Unlocked"} /></FieldRow>
              </EditorSection>

              <EditorSection id="admin-notes" title="Admin Notes" description="Record identifiers and quality metadata.">
                <FieldRow columns={4}><ReadOnlyField label="Canonical Location ID" value={canonicalId || "Missing canonical row"} /><ReadOnlyField label="Source ID" value={sourceId || "—"} /><ReadOnlyField label="Effective ID" value={effectiveId || "—"} /><ReadOnlyField label="Source Table" value={table} /></FieldRow>
                <FieldRow columns={2}><ReadOnlyField label="Link Status" value={canonicalId ? "Dashboard links use canonical locations.id" : "Dashboard links need canonical row repair"} /><ReadOnlyField label="Quality Score" value={`${safeScore}/100`} /></FieldRow>
              </EditorSection>
            </section>

            <aside className="space-y-6 xl:sticky xl:top-[158px] xl:self-start">
              <LocationPreview form={form} type={type} mainImage={mainImage} publicPreviewHref={publicPreviewHref} readiness={readiness} safeScore={safeScore} readinessPercent={readinessPercent} links={links} />
              <EditorSection id="recent-activity" title="Recent Activity" description="Operational status and latest save context.">
                <div className="grid gap-3">
                  <ReadOnlyField label="Save Status" value={hasUnsavedChanges ? "Draft changes pending" : "All changes saved"} />
                  <ReadOnlyField label="Profile Source" value={managedByLabel(form.profile_managed_by)} />
                  <ReadOnlyField label="Owner Verified" value={form.profile_owner_verified_at ? new Date(form.profile_owner_verified_at).toLocaleString() : "Not yet"} />
                  <ReadOnlyField label="Last Owner Update" value={form.profile_last_owner_update_at ? new Date(form.profile_last_owner_update_at).toLocaleString() : "—"} />
                  <ReadOnlyField label="Last Admin Update" value={form.profile_last_admin_update_at ? new Date(form.profile_last_admin_update_at).toLocaleString() : "—"} />
                  {isImpersonating ? <StatusPill tone="dark">Admin View</StatusPill> : null}
                </div>
              </EditorSection>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}


function dashboardRepairTitle(links: ReturnType<typeof buildLocationEditorLinks>) {
  return links.hasCanonicalId ? undefined : "Needs canonical locations.id repair";
}

function dashboardRepairClass(links: ReturnType<typeof buildLocationEditorLinks>) {
  return links.hasCanonicalId ? "" : " border border-amber-400/40 bg-amber-400/10 text-amber-100";
}

function EditorSidebar({ links }: { links: ReturnType<typeof buildLocationEditorLinks> }) {
  const sections = [
    [
      "Primary",
      [{ label: "Back to Location Dashboard", href: links.dashboard }],
    ],
    [
      "Operations",
      [
        { label: "Locations", href: links.dashboard },
        { label: "Menus", href: links.menuEditor },
        { label: "Reservations", href: links.reserveDashboard },
        { label: "Customers", href: links.vip },
        { label: "Reviews", href: links.reviews },
      ],
    ],
    [
      "Marketing",
      [
        { label: "Campaigns", href: links.marketing },
        { label: "Promotions", href: links.promotions },
        { label: "Email", href: links.messaging },
        { label: "SMS", href: links.messaging },
      ],
    ],
    [
      "Analytics",
      [
        { label: "Reports", href: links.analytics },
        { label: "Insights", href: links.analytics },
        { label: "Performance", href: links.analytics },
      ],
    ],
    [
      "Settings",
      [
        { label: "Users", href: links.settings },
        { label: "Roles", href: links.settings },
        { label: "Brand Settings", href: links.branding },
      ],
    ],
  ] as const;

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[256px] overflow-y-auto border-r border-white/10 bg-[#050607] px-4 py-5 shadow-2xl lg:block">
      <div className="mb-5 px-3">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff1654]">TheOutHaven</p>
        <h2 className="mt-2 text-xl font-black text-white">Enterprise</h2>
      </div>
      <Link href={links.dashboard} title={dashboardRepairTitle(links)} className={`mb-5 flex rounded-2xl border border-[#e1062a]/40 bg-[#e1062a]/15 px-3 py-3 text-sm font-black text-white transition hover:bg-[#e1062a]/25${dashboardRepairClass(links)}`}>
        Back to Location Dashboard
      </Link>
      <nav className="space-y-6">
        {sections.map(([section, items]) => (
          <div key={section}>
            <p className="px-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/40">{section}</p>
            <div className="mt-2 grid gap-1">
              {items.map((item) => {
                const active = item.label === "Locations";
                return (
                  <Link key={`${section}-${item.label}`} href={item.href} title={dashboardRepairTitle(links)} className={`rounded-2xl px-3 py-2.5 text-sm font-bold transition ${active ? "border border-[#e1062a]/40 bg-[#e1062a]/25 text-white" : "text-white/65 hover:bg-white/[0.06] hover:text-white"}${dashboardRepairClass(links)}`}>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

function LocationPreview({
  form,
  type,
  mainImage,
  publicPreviewHref,
  readiness,
  safeScore,
  readinessPercent,
  links,
}: {
  form: FormState;
  type: LocationType;
  mainImage: string;
  publicPreviewHref: string;
  readiness: readonly (readonly [string, boolean])[];
  safeScore: number;
  readinessPercent: number;
  links: ReturnType<typeof buildLocationEditorLinks>;
}) {
  const address = formatFullAddress({
    address: form.address,
    city: form.city,
    state: form.state,
    zip_code: form.zip_code,
    fallback: "Address will appear here",
  });
  const statusTiles = [
    ["Location Type", type === "restaurants" ? form.cuisine || "Restaurant" : form.activity_type || "Activity"],
    ["Public Status", publicStatusLabel(form)],
    ["Search Visibility", searchVisibilityLabel(form.is_searchable)],
    ["Hours", form.hours || (form.operating_hours ? "Configured" : "Not set")],
    ["Reservations", reservationsLabel(form)],
    ["QR Tools", "Available"],
  ];
  const initials = getInitials(form.name);
  const logoUrl = getLogoUrl(form);

  return (
    <section id="location-preview" className="overflow-hidden rounded-[24px] border border-white/10 bg-[#10141b] text-white shadow-2xl">
      <div className="relative">
        {mainImage ? (
          <Image src={mainImage} alt={form.name || "Location preview"} width={900} height={420} className="h-36 w-full object-cover sm:h-40" unoptimized />
        ) : (
          <div className="flex h-36 w-full items-center justify-center bg-white/[0.04] text-sm font-black uppercase tracking-[0.18em] text-white/35 sm:h-40">One main preview image</div>
        )}
        <div className="absolute -bottom-8 left-6 grid h-16 w-16 place-items-center overflow-hidden rounded-[20px] border-4 border-[#e1062a]/70 bg-[#171b23] shadow-2xl sm:h-20 sm:w-20">
          {logoUrl ? (
            <Image src={logoUrl} alt={`${form.name || "Location"} logo`} width={160} height={160} className="h-full w-full object-contain" unoptimized />
          ) : (
            <span className="px-2 text-center text-lg font-black leading-tight text-white sm:text-xl">{initials}</span>
          )}
        </div>
      </div>
      <div className="px-6 pb-6 pt-12">
        <div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[0.25em] text-[#ff9bb6]">Location Preview</p><StatusPill tone="dark">{publicStatusLabel(form)}</StatusPill></div>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-white">{form.name || "Location Name"}</h2>
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-white/55">{form.description || "Short description will appear here for guests reviewing this location."}</p>
        <div className="mt-5 grid gap-2 text-sm font-semibold text-white/60">
          <p>{form.phone || "Phone not set"}</p>
          <p>{form.owner_email || "Email not set"}</p>
          <p>{form.website || "Website not set"}</p>
          <p>{address}</p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {statusTiles.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-[#121721] p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">{label}</p>
              <p className="mt-1 truncate text-sm font-black text-white">{value}</p>
            </div>
          ))}
        </div>
        <Link href={publicPreviewHref} className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-[#ff1654]/20 transition hover:bg-[#ff2142]">View Public Page</Link>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Link href={links.dashboard} title={dashboardRepairTitle(links)} className={`${secondaryButtonClass}${dashboardRepairClass(links)}`}>Back to Location Dashboard</Link>
          <Link href={links.crm} title={dashboardRepairTitle(links)} className={`${secondaryButtonClass}${dashboardRepairClass(links)}`}>Open CRM</Link>
          <Link href={links.reserveDashboard} title={dashboardRepairTitle(links)} className={`${secondaryButtonClass}${dashboardRepairClass(links)}`}>Reserve Dashboard</Link>
          <Link href={links.reservationLayout} title={dashboardRepairTitle(links)} className={`${secondaryButtonClass}${dashboardRepairClass(links)}`}>Reservation Layout</Link>
          <Link href={links.qrTools} title={dashboardRepairTitle(links)} className={`${secondaryButtonClass}${dashboardRepairClass(links)}`}>QR Tools</Link>
          <Link href={links.menuEditor} title={dashboardRepairTitle(links)} className={`${secondaryButtonClass}${dashboardRepairClass(links)}`}>Open Menu Editor</Link>
          <Link href={links.menuViewer} className={secondaryButtonClass}>View Public Menu</Link>
          <Link href={links.photos} title={dashboardRepairTitle(links)} className={`${secondaryButtonClass}${dashboardRepairClass(links)}`}>Manage Photos</Link>
          <Link href={links.analytics} title={dashboardRepairTitle(links)} className={`${secondaryButtonClass}${dashboardRepairClass(links)}`}>Analytics</Link>
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Admin tools</p>
          <Link href={links.adminQrTools} title={dashboardRepairTitle(links)} className={`${secondaryButtonClass} mt-2 inline-flex w-full justify-center${dashboardRepairClass(links)}`}>Admin Claim QR</Link>
        </div>
      </div>
    </section>
  );
}

function EditorSection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-36 ${panelClass} text-white`}>
      <div className={panelHeaderClass}>
        <h2 className="text-lg font-black text-white">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-white/55">{description}</p> : null}
      </div>
      <div className="grid gap-4 p-5 md:p-6">{children}</div>
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
      {helper ? <span className="text-xs font-semibold text-white/40">{helper}</span> : null}
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
      {helper ? <span className="text-xs font-semibold text-white/40">{helper}</span> : null}
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
      <div className="rounded-2xl border border-white/10 bg-[#121721] px-4 py-3 text-sm font-semibold text-white/55 shadow-sm">
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
    <label className="flex cursor-pointer items-start gap-4 rounded-[20px] border border-white/10 bg-[#121721] p-4 shadow-sm transition hover:border-[#ff1654]/30">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 accent-[#ff1654]"
      />
      <span>
        <span className="block text-sm font-black text-white">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-white/45">{text}</span>
      </span>
    </label>
  );
}

function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: PillTone }) {
  const tones: Record<PillTone, string> = {
    neutral: "border-white/10 bg-white/[0.04] text-white/65",
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
