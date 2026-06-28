"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Edit3,
  Loader2,
  MapPin,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase-browser";

type LocationType = "restaurant" | "activity";
type LayoutStatus = "available" | "unavailable" | "hidden";

type LocationOption = {
  id: string;
  type: LocationType;
  name: string;
  city?: string | null;
  state?: string | null;
  owner_email?: string | null;
  address?: string | null;
};

type LayoutItem = {
  id: string;
  location_id: string;
  location_type: LocationType;
  item_name: string;
  item_type: string | null;
  capacity_min: number | null;
  capacity_max: number | null;
  is_active: boolean | null;
  layout_x: number | null;
  layout_y: number | null;
  layout_width: number | null;
  layout_height: number | null;
  rotation?: number | null;
  status?: string | null;
  sort_order?: number | null;
  duration_minutes?: number | null;
  default_duration_minutes?: number | null;
  reservation_duration_minutes?: number | null;
  notes?: string | null;
};

type Props = {
  backHref: string;
  adminMode?: boolean;
  createMode?: boolean;
  initialLocationId?: string;
  initialLocationType?: LocationType;
};

type FormState = {
  id: string;
  item_name: string;
  item_type: string;
  capacity: number;
  duration: number;
  customDuration: number;
  notes: string;
  status: LayoutStatus;
  layout_x: number;
  layout_y: number;
  layout_width: number;
  layout_height: number;
  rotation: number;
  sort_order: number;
};

const RESTAURANT_TYPES = [
  "Table",
  "Booth",
  "Bar Seat",
  "Private Room",
  "Lounge Area",
  "Patio Seat",
  "Counter Seat",
  "Other",
];
const ACTIVITY_TYPES = [
  "Room",
  "Lane",
  "Court",
  "Studio",
  "Private Area",
  "Party Room",
  "Station",
  "Experience Area",
  "Other",
];
const DURATION_OPTIONS = [30, 45, 60, 90, 120, 180];
const CANVAS_WIDTH = 920;
const CANVAS_HEIGHT = 560;
const CARD_WIDTH = 172;
const CARD_HEIGHT = 118;

function todayKey() {
  return new Date().toISOString().split("T")[0];
}

function prettyLabel(value: string | null | undefined) {
  return String(value || "Layout Area")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function typeToValue(value: string) {
  return value.toLowerCase().replaceAll(" ", "_");
}

function formatDuration(minutes: number | null | undefined) {
  const value = Math.max(1, Number(minutes || 90));
  if (value < 60) return `${value} minutes`;
  const hours = Math.floor(value / 60);
  const remainder = value % 60;
  const hourText = hours === 1 ? "1 hour" : `${hours} hours`;
  return remainder ? `${hourText} ${remainder} minutes` : hourText;
}

function statusFromItem(item: LayoutItem | null): LayoutStatus {
  const value = String(item?.status || "").toLowerCase();
  if (value === "hidden") return "hidden";
  if (value === "unavailable" || value === "blocked" || value === "maintenance" || item?.is_active === false) {
    return "unavailable";
  }
  return "available";
}

function statusLabel(status: LayoutStatus) {
  if (status === "unavailable") return "Temporarily unavailable";
  if (status === "hidden") return "Hidden from booking";
  return "Available";
}

function statusClass(status: LayoutStatus) {
  if (status === "available") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (status === "hidden") return "border-neutral-300 bg-neutral-100 text-neutral-600";
  return "border-amber-300 bg-amber-50 text-amber-800";
}

function itemDuration(item: LayoutItem | null | undefined) {
  return Number(
    item?.duration_minutes ||
      item?.default_duration_minutes ||
      item?.reservation_duration_minutes ||
      90,
  );
}

function itemCapacity(item: LayoutItem | null | undefined) {
  return Number(item?.capacity_max || item?.capacity_min || 2);
}

function defaultForm(item: LayoutItem | null, nextSpot: { left: number; top: number }): FormState {
  const duration = itemDuration(item);
  return {
    id: item?.id || "",
    item_name: item?.item_name || "",
    item_type: item?.item_type || "table",
    capacity: itemCapacity(item),
    duration: DURATION_OPTIONS.includes(duration) ? duration : 0,
    customDuration: DURATION_OPTIONS.includes(duration) ? 90 : duration,
    notes: item?.notes || "",
    status: statusFromItem(item),
    layout_x: Number(item?.layout_x ?? nextSpot.left),
    layout_y: Number(item?.layout_y ?? nextSpot.top),
    layout_width: Number(item?.layout_width || CARD_WIDTH),
    layout_height: Number(item?.layout_height || CARD_HEIGHT),
    rotation: Number(item?.rotation || 0),
    sort_order: Number(item?.sort_order || 0),
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function autoPlacement(items: LayoutItem[]) {
  const index = items.length;
  const gap = 24;
  const cols = Math.max(1, Math.floor((CANVAS_WIDTH - gap) / (CARD_WIDTH + gap)));
  return {
    left: gap + (index % cols) * (CARD_WIDTH + gap),
    top: gap + Math.floor(index / cols) * (CARD_HEIGHT + gap),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function LocationLayoutClient({ backHref, adminMode = false, createMode = false, initialLocationId = "", initialLocationType }: Props) {
  const supabase = createClient();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; offsetLeft: number; offsetTop: number } | null>(null);
  const [items, setItems] = useState<LayoutItem[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationType, setLocationType] = useState<LocationType>(initialLocationType || "restaurant");
  const [locationId, setLocationId] = useState(initialLocationId);
  const [locationSearch, setLocationSearch] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [editVisualLayout, setEditVisualLayout] = useState(!createMode);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const scopedInitialLocation = Boolean(initialLocationId);
  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === locationId) || null,
    [locations, locationId],
  );
  const visibleItems = useMemo(
    () => items.filter((item) => !locationId || item.location_id === locationId),
    [items, locationId],
  );
  const nextSpot = useMemo(() => autoPlacement(visibleItems), [visibleItems]);
  const selectedItem = useMemo(
    () => visibleItems.find((item) => item.id === selectedItemId) || null,
    [visibleItems, selectedItemId],
  );
  const [form, setForm] = useState<FormState>(defaultForm(null, { left: 24, top: 24 }));

  const orderedTypeGroups = useMemo(() => {
    const restaurant = { heading: "Restaurant, bar, and lounge areas", options: RESTAURANT_TYPES };
    const activity = { heading: "Activity and venue areas", options: ACTIVITY_TYPES };
    return locationType === "activity" ? [activity, restaurant] : [restaurant, activity];
  }, [locationType]);

  const filteredLocations = useMemo(() => {
    const search = locationSearch.toLowerCase().trim();
    return locations.filter((location) => {
      if (!search) return true;
      return [location.name, location.city, location.state, location.owner_email, location.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [locations, locationSearch]);

  useEffect(() => {
    loadLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, locationType]);

  useEffect(() => {
    const channel = supabase
      .channel("location-layout-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "layout_items" }, () => loadLayout(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "location_bookable_items" }, () => loadLayout(false))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, locationType]);

  useEffect(() => {
    setForm(defaultForm(selectedItem, nextSpot));
  }, [selectedItem, nextSpot]);

  async function loadLayout(showLoader = true) {
    try {
      if (showLoader) setLoading(true);
      setError("");
      const params = new URLSearchParams({ date: todayKey() });
      if (locationId) {
        params.set("locationId", locationId);
        params.set("type", locationType);
      }
      const response = await fetch(`/api/reserve/portal/layout?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load the location layout.");
      setItems(data.items || []);
      const loadedLocations = (data.locations || []) as LocationOption[];
      const matchedInitialLocation = initialLocationId
        ? loadedLocations.find((location) => location.id === initialLocationId)
        : null;
      const normalizedLocations =
        initialLocationId && !matchedInitialLocation
          ? [
              {
                id: initialLocationId,
                type: initialLocationType || locationType || "restaurant",
                name: adminMode ? "TheOutHaven Demo Location" : "Selected location",
              },
              ...loadedLocations,
            ]
          : loadedLocations;
      setLocations(normalizedLocations);
      if (initialLocationId) {
        if (locationId !== initialLocationId) setLocationId(initialLocationId);
        if (matchedInitialLocation?.type && matchedInitialLocation.type !== locationType) {
          setLocationType(matchedInitialLocation.type);
        } else if (!matchedInitialLocation && initialLocationType && initialLocationType !== locationType) {
          setLocationType(initialLocationType);
        }
        if (!matchedInitialLocation) {
          setMessage("Acting as demo location. This location was added to the selector so the demo context stays active.");
        }
        return;
      }
      if (!locationId && loadedLocations.length > 0) {
        const first = data.locations[0];
        setLocationId(first.id);
        setLocationType(first.type || "restaurant");
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Unable to load the location layout."));
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  async function saveArea(override?: Partial<FormState>) {
    if (!locationId) {
      setError("Choose a location before creating a layout area.");
      return;
    }
    const values = { ...form, ...override };
    const durationMinutes = Number(values.duration === 0 ? values.customDuration : values.duration);
    try {
      setSaving("area");
      setError("");
      setMessage("");
      const action = values.id ? "update_layout_item" : "create_layout_item";
      const response = await fetch("/api/reserve/portal/layout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          id: values.id,
          location_id: locationId,
          location_type: locationType,
          source_table: locationType,
          item_name: values.item_name || "New Layout Area",
          item_type: values.item_type,
          capacity: values.capacity,
          duration_minutes: durationMinutes,
          default_duration_minutes: durationMinutes,
          reservation_duration_minutes: durationMinutes,
          notes: values.notes,
          status: values.status,
          is_active: values.status !== "hidden",
          layout_x: values.layout_x,
          layout_y: values.layout_y,
          layout_width: values.layout_width || CARD_WIDTH,
          layout_height: values.layout_height || CARD_HEIGHT,
          rotation: values.rotation,
          sort_order: values.sort_order,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save this layout area.");
      setMessage(values.id ? "Layout area updated." : "Layout area created and placed on the visual layout.");
      setSelectedItemId(data.item?.id || "");
      await loadLayout(false);
      if (!values.id) {
        setForm(defaultForm(null, autoPlacement([...visibleItems, data.item])));
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Unable to save this layout area."));
    } finally {
      setSaving("");
    }
  }

  async function moveArea(id: string, left: number, top: number) {
    const item = visibleItems.find((candidate) => candidate.id === id);
    if (!item) return;
    const durationMinutes = itemDuration(item);
    const response = await fetch("/api/reserve/portal/layout", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "move_layout_item",
        id: item.id,
        location_id: item.location_id,
        location_type: item.location_type,
        item_name: item.item_name,
        item_type: item.item_type || "table",
        capacity: itemCapacity(item),
        duration_minutes: durationMinutes,
        default_duration_minutes: durationMinutes,
        reservation_duration_minutes: durationMinutes,
        status: statusFromItem(item),
        is_active: item.is_active !== false,
        layout_x: left,
        layout_y: top,
        layout_width: item.layout_width || CARD_WIDTH,
        layout_height: item.layout_height || CARD_HEIGHT,
        rotation: item.rotation || 0,
        sort_order: item.sort_order || 0,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to save the new position.");
  }

  async function deleteArea(item: LayoutItem) {
    if (!window.confirm("Delete this layout area? Existing reservations may be affected.")) return;
    try {
      setSaving(item.id);
      setError("");
      const response = await fetch("/api/reserve/portal/layout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_layout_item", id: item.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to delete this layout area.");
      setMessage("Layout area deleted.");
      if (selectedItemId === item.id) setSelectedItemId("");
      await loadLayout(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Unable to delete this layout area."));
    } finally {
      setSaving("");
    }
  }

  function beginDrag(event: React.PointerEvent<HTMLButtonElement>, item: LayoutItem) {
    if (!editVisualLayout) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    dragRef.current = {
      id: item.id,
      offsetLeft: event.clientX - rect.left - Number(item.layout_x || 0),
      offsetTop: event.clientY - rect.top - Number(item.layout_y || 0),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continueDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const left = clamp(event.clientX - rect.left - drag.offsetLeft, 8, CANVAS_WIDTH - CARD_WIDTH - 8);
    const top = clamp(event.clientY - rect.top - drag.offsetTop, 8, CANVAS_HEIGHT - CARD_HEIGHT - 8);
    setItems((current) =>
      current.map((item) => (item.id === drag.id ? { ...item, layout_x: left, layout_y: top } : item)),
    );
  }

  async function endDrag() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const item = items.find((candidate) => candidate.id === drag.id);
    if (!item) return;
    try {
      await moveArea(item.id, Number(item.layout_x || 0), Number(item.layout_y || 0));
      setMessage("Visual layout saved.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Unable to save the new position."));
      await loadLayout(false);
    }
  }

  const completedSteps = [visibleItems.length > 0, visibleItems.some((item) => itemCapacity(item) > 0), visibleItems.some((item) => itemDuration(item) > 0), visibleItems.some((item) => statusFromItem(item) === "available")].filter(Boolean).length;
  const createParams = new URLSearchParams();
  if (locationId) createParams.set("locationId", locationId);
  if (locationType) createParams.set("type", locationType);
  if (adminMode && initialLocationId) {
    createParams.set("adminLocationId", initialLocationId);
    createParams.set("demo", "1");
    if (backHref.includes("demo-center")) createParams.set("fromDemoCenter", "1");
  }
  const createHref = `/reserve/dashboard/location-layout/create${createParams.toString() ? `?${createParams.toString()}` : ""}`;

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-bold text-white/65 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href={createHref} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black sm:w-auto">
              <Plus className="h-4 w-4" /> Create Layout Area
            </Link>
            <button onClick={() => setEditVisualLayout((value) => !value)} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white sm:w-auto">
              <Edit3 className="h-4 w-4" /> {editVisualLayout ? "Finish Visual Layout" : "Edit Visual Layout"}
            </button>
          </div>
        </div>

        <section className="mt-8 rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#1a0505] via-black to-[#120d0b] p-6 shadow-2xl sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-red-300">TheOutHaven Reserve</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{createMode ? "Create Location Layout" : adminMode ? "Admin Location Layout" : "Location Layout"}</h1>
          <p className="mt-4 max-w-3xl text-base text-white/70">
            {createMode
              ? "Add the tables, booths, rooms, lanes, or spaces guests can reserve. You can drag them into place after creating them."
              : "Create layout areas in plain business language, then drag them visually into place."}
          </p>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-4">
          {["Add reservable areas", "Set guest capacity", "Choose reservation duration", "Open areas for booking"].map((step, index) => {
            const done = index < completedSteps;
            return (
              <div key={step} className={`rounded-2xl border p-4 ${done ? "border-red-500 bg-red-600/20" : "border-white/10 bg-white/[0.04]"}`}>
                <div className="flex items-center gap-3">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${done ? "bg-red-600 text-white" : "bg-white/10 text-white/50"}`}>{index + 1}</span>
                  <p className="text-sm font-black">{step}</p>
                </div>
              </div>
            );
          })}
        </section>

        {adminMode ? (
          <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-xl font-black">{scopedInitialLocation ? "Acting as demo location" : "Find a location"}</h2>
            <p className="mt-2 text-sm text-white/60">{scopedInitialLocation ? "Demo Center opened this tool with a fixed location context. The builder will not auto-select another location." : "Search by location name, city/state, owner email, or location ID."}</p>
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-black px-4 py-3">
              <Search className="h-4 w-4 text-white/40" />
              <input value={locationSearch} onChange={(event) => setLocationSearch(event.target.value)} placeholder="Search for a location to manage its reservation layout." className="w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/35" />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {scopedInitialLocation ? (
                <p className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">Acting as demo location: {selectedLocation?.name || initialLocationId}</p>
              ) : locationSearch.trim() === "" ? (
                <p className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm font-bold text-white/55">Search for a location to manage its reservation layout.</p>
              ) : filteredLocations.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm font-bold text-white/55">No matching locations found.</p>
              ) : (
                filteredLocations.slice(0, 9).map((location) => (
                  <button key={location.id} onClick={() => { if (scopedInitialLocation) return; setLocationId(location.id); setLocationType(location.type); }} className={`rounded-2xl border p-4 text-left transition ${location.id === locationId ? "border-red-500 bg-red-600/20" : "border-white/10 bg-black/30 hover:border-white/30"}`}>
                    <p className="font-black">{location.name}</p>
                    <p className="mt-1 text-sm text-white/55">{[location.city, location.state].filter(Boolean).join(", ") || "Address details not listed"}</p>
                    {location.owner_email ? <p className="mt-1 text-xs font-bold text-white/40">Owner: {location.owner_email}</p> : null}
                  </button>
                ))
              )}
            </div>
          </section>
        ) : null}

        {selectedLocation ? (
          <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-black">{selectedLocation.name}</h2>
                <p className="mt-1 flex items-center gap-2 text-sm text-white/60"><MapPin className="h-4 w-4" /> {[selectedLocation.city, selectedLocation.state].filter(Boolean).join(", ") || "Location selected"}</p>
                {selectedLocation.owner_email ? <p className="mt-1 text-sm text-white/50">Owner: {selectedLocation.owner_email}</p> : null}
              </div>
              <select value={locationType} onChange={(event) => setLocationType(event.target.value as LocationType)} className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-black text-white outline-none">
                <option value="restaurant">Restaurant / bar / lounge</option>
                <option value="activity">Activity / venue</option>
              </select>
            </div>
          </section>
        ) : null}

        {error ? <div className="mt-5 rounded-2xl border border-red-400/40 bg-red-950/60 p-4 text-sm font-bold text-red-100">{error}</div> : null}
        {message ? <div className="mt-5 rounded-2xl border border-emerald-400/40 bg-emerald-950/40 p-4 text-sm font-bold text-emerald-100">{message}</div> : null}

        <section className="mt-6 grid gap-6 xl:grid-cols-[390px_1fr]">
          <aside className="rounded-[2rem] border border-white/10 bg-[#120d0b] p-5 shadow-2xl">
            <h2 className="text-xl font-black">{form.id ? "Edit Layout Area" : "Create Layout Area"}</h2>
            <p className="mt-2 text-sm text-white/55">Use simple names your team will recognize. Restaurant example: Table 1, VIP Booth, Bar Seat 3, Patio Table. Activity example: Room A, Bowling Lane 2, Party Room, Studio 1.</p>
            <div className="mt-5 space-y-4">
              <label className="space-y-2 block"><span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Area Type</span><select value={form.item_type} onChange={(event) => setForm((current) => ({ ...current, item_type: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none">{orderedTypeGroups.map((group) => (<optgroup key={group.heading} label={group.heading}>{group.options.map((type) => <option key={type} value={typeToValue(type)}>{type}</option>)}</optgroup>))}</select></label>
              <label className="space-y-2 block"><span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Area Name</span><input value={form.item_name} onChange={(event) => setForm((current) => ({ ...current, item_name: event.target.value }))} placeholder="Table 1, VIP Booth, Bar Seat 4, Room A, Bowling Lane 2" className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-white/25" /></label>
              <label className="space-y-2 block"><span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">{locationType === "activity" ? "How many people can use this area?" : "How many guests can sit here?"}</span><input type="number" min="1" value={form.capacity} onChange={(event) => setForm((current) => ({ ...current, capacity: Number(event.target.value) }))} className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none" /></label>
              <label className="space-y-2 block"><span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">How long can this area be reserved for?</span><select value={form.duration} onChange={(event) => setForm((current) => ({ ...current, duration: Number(event.target.value) }))} className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none">{DURATION_OPTIONS.map((minutes) => <option key={minutes} value={minutes}>{formatDuration(minutes)}</option>)}<option value={0}>Custom</option></select></label>
              {form.duration === 0 ? <label className="space-y-2 block"><span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Custom duration in minutes</span><input type="number" min="1" value={form.customDuration} onChange={(event) => setForm((current) => ({ ...current, customDuration: Number(event.target.value) }))} className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none" /></label> : null}
              <label className="space-y-2 block"><span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Optional notes</span><textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Near window, VIP only, wheelchair accessible, etc." className="min-h-24 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-white/25" /></label>
              <label className="space-y-2 block"><span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Status</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as LayoutStatus }))} className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none"><option value="available">Available</option><option value="unavailable">Temporarily unavailable</option><option value="hidden">Hidden from booking</option></select></label>
              <button onClick={() => saveArea()} disabled={saving === "area"} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-4 text-sm font-black text-white disabled:opacity-50">{saving === "area" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save Layout Area</button>
              {form.id ? <button onClick={() => { setSelectedItemId(""); setForm(defaultForm(null, nextSpot)); }} className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-black text-white/75">Start a new layout area</button> : null}
            </div>
          </aside>

          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-white text-black shadow-2xl">
              <div className="border-b border-neutral-200 p-5">
                <h2 className="text-2xl font-black">Visual Layout</h2>
                <p className="mt-1 text-sm text-neutral-600">Drag layout areas into place. The system saves placement internally so owners never need to enter technical values.</p>
              </div>
              {loading ? (
                <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-red-600" /></div>
              ) : visibleItems.length === 0 ? (
                <div className="flex min-h-80 items-center justify-center p-8 text-center"><div><p className="text-2xl font-black">No layout areas yet.</p><p className="mt-2 text-sm text-neutral-500">Start by adding your first table, booth, room, lane, or reservable space.</p></div></div>
              ) : (
                <div className="overflow-x-auto p-4">
                  <div ref={canvasRef} style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} className="relative rounded-[1.5rem] border border-neutral-200 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.08)_1px,transparent_0)] [background-size:24px_24px]">
                    {visibleItems.map((item) => {
                      const status = statusFromItem(item);
                      return (
                        <button key={item.id} onClick={() => setSelectedItemId(item.id)} onPointerDown={(event) => beginDrag(event, item)} onPointerMove={continueDrag} onPointerUp={endDrag} onPointerCancel={endDrag} style={{ left: Number(item.layout_x || 0), top: Number(item.layout_y || 0), width: CARD_WIDTH, minHeight: CARD_HEIGHT, touchAction: editVisualLayout ? "none" : "auto" }} className={`absolute rounded-2xl border bg-white p-3 text-left shadow-xl transition ${selectedItemId === item.id ? "border-red-500 ring-4 ring-red-500/15" : "border-neutral-200"}`}>
                          <p className="truncate text-base font-black">{item.item_name || "Layout Area"}</p>
                          <p className="mt-1 text-xs font-bold text-neutral-500">Type: {prettyLabel(item.item_type)}</p>
                          <p className="text-xs font-bold text-neutral-500">Capacity: {itemCapacity(item)} {locationType === "activity" ? "people" : "guests"}</p>
                          <p className="text-xs font-bold text-neutral-500">Duration: {formatDuration(itemDuration(item))}</p>
                          <span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${statusClass(status)}`}>Status: {statusLabel(status)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white p-5 text-black shadow-2xl">
              <div className="flex items-center justify-between gap-4"><div><h2 className="text-2xl font-black">Existing Layout Areas</h2><p className="mt-1 text-sm text-neutral-500">Review every reservable space customers can book.</p></div><div className="rounded-2xl bg-black px-4 py-3 text-sm font-black text-white"><Users className="mr-2 inline h-4 w-4" />{visibleItems.length}</div></div>
              {visibleItems.length === 0 ? <p className="mt-6 rounded-2xl bg-neutral-100 p-5 text-sm font-bold text-neutral-600">No layout areas yet. Start by adding your first table, booth, room, lane, or reservable space.</p> : <div className="mt-5 grid gap-4 md:grid-cols-2">{visibleItems.map((item) => { const status = statusFromItem(item); return (<article key={item.id} className="rounded-2xl border border-neutral-200 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-black">{item.item_name || "Layout Area"}</h3><p className="mt-1 text-sm font-bold text-neutral-500">Type: {prettyLabel(item.item_type)}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(status)}`}>{statusLabel(status)}</span></div><div className="mt-4 grid gap-2 text-sm font-bold text-neutral-600"><p>Capacity: {itemCapacity(item)} {locationType === "activity" ? "people" : "guests"}</p><p>Duration: {formatDuration(itemDuration(item))}</p></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><button onClick={() => setSelectedItemId(item.id)} className="rounded-xl bg-black px-4 py-3 text-sm font-black text-white">Edit</button><button onClick={() => deleteArea(item)} disabled={saving === item.id} className="rounded-xl bg-red-50 px-4 py-3 text-sm font-black text-red-700 disabled:opacity-50"><Trash2 className="mr-1 inline h-4 w-4" />Delete</button></div></article>); })}</div>}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
