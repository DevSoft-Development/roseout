"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  AlertTriangle,
  Bell,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Expand,
  LogOut,
  MessageSquare,
  Minimize2,
  RefreshCw,
  Search,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import ReserveConversationThread from "@/components/reserve/ReserveConversationThread";
import {
  getFloorSnapshotState,
  resourceCapacity,
  resourceName,
} from "@/lib/reservations/floorSnapshot";
import {
  formatReservationTime,
  getReservationGuestName,
} from "@/lib/reservations/ui";

const ACTIVE = new Set(["pending", "confirmed", "checked_in", "waiting", "arrived", "seated", "occupied"]);
const CACHE_VERSION = 1;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function localDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function cacheKey(locationId: string, date: string) {
  return `theouthaven:reserve-host:v${CACHE_VERSION}:${locationId}:${date}`;
}

function normalizedType(resource: any) {
  return String(resource?.item_type || resource?.type || "").toLowerCase().replaceAll(" ", "_");
}

function isBarResource(resource: any) {
  return ["bar", "bar_seat", "counter", "counter_seat"].includes(normalizedType(resource));
}

function statusClass(status: string) {
  if (status === "Open") return "border-emerald-400/65 bg-emerald-500/12 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.08)]";
  if (status === "Seated") return "border-rose-400/70 bg-rose-500/16 text-rose-100 shadow-[0_0_24px_rgba(244,63,94,0.12)]";
  if (["Waiting", "Ready sent", "Due now"].includes(status)) return "border-amber-300/65 bg-amber-400/14 text-amber-100 shadow-[0_0_20px_rgba(251,191,36,0.1)]";
  if (["Blocked"].includes(status)) return "border-red-500/60 bg-red-500/10 text-red-200";
  return "border-white/15 bg-white/[0.045] text-white/80";
}

function resourceLayoutValue(resource: any, key: "x" | "y" | "width" | "height") {
  const aliases = key === "x"
    ? ["layout_x", "x_position"]
    : key === "y"
      ? ["layout_y", "y_position"]
      : key === "width"
        ? ["layout_width", "width"]
        : ["layout_height", "height"];
  for (const alias of aliases) {
    const value = Number(resource?.[alias]);
    if (Number.isFinite(value)) return value;
  }
  return key === "width" ? 150 : key === "height" ? 100 : 0;
}

function resourceVisualType(resource: any) {
  const type = normalizedType(resource);
  if (type.includes("booth")) return "booth";
  if (type.includes("private")) return "private";
  if (type.includes("patio")) return "patio";
  if (type.includes("table")) return "table";
  return "table";
}

function floorItemStyle(resource: any, width: number, height: number): CSSProperties {
  const x = resourceLayoutValue(resource, "x");
  const y = resourceLayoutValue(resource, "y");
  const sourceWidth = Math.max(1, resourceLayoutValue(resource, "width"));
  const sourceHeight = Math.max(1, resourceLayoutValue(resource, "height"));
  const type = resourceVisualType(resource);
  const capacity = Math.max(1, Number(resourceCapacity(resource) || 1));
  const centerX = x + sourceWidth / 2;
  const centerY = y + sourceHeight / 2;

  let visualWidth = 96;
  let visualHeight = 96;

  if (isBarResource(resource)) {
    visualWidth = 420;
    visualHeight = 76;
  } else if (type === "booth") {
    visualWidth = capacity >= 8 ? 154 : capacity >= 6 ? 144 : 132;
    visualHeight = 86;
  } else if (type === "private") {
    visualWidth = 176;
    visualHeight = 132;
  } else if (type === "patio") {
    visualWidth = 104;
    visualHeight = 104;
  } else if (capacity <= 2) {
    visualWidth = 88;
    visualHeight = 88;
  } else if (capacity <= 4) {
    visualWidth = 98;
    visualHeight = 98;
  } else if (capacity <= 6) {
    visualWidth = 124;
    visualHeight = 84;
  } else {
    visualWidth = 142;
    visualHeight = 88;
  }

  const left = Math.max(4, Math.min(96, (centerX / width) * 100));
  const top = Math.max(5, Math.min(95, (centerY / height) * 100));

  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${visualWidth}px`,
    height: `${visualHeight}px`,
    transform: `translate(-50%, -50%) rotate(${Number(resource?.rotation || 0)}deg)`,
  };
}

function chairStyle(index: number, capacity: number) {
  const side = index % 4;
  const positionIndex = Math.floor(index / 4);
  const countOnSide = Math.ceil(Math.max(0, capacity - side) / 4);
  const pct = `${((positionIndex + 1) / (countOnSide + 1)) * 100}%`;
  if (side === 0) return { left: pct, top: "1px", transform: "translate(-50%, -50%)" };
  if (side === 1) return { right: "1px", top: pct, transform: "translate(50%, -50%)" };
  if (side === 2) return { left: pct, bottom: "1px", transform: "translate(-50%, 50%)" };
  return { left: "1px", top: pct, transform: "translate(-50%, -50%)" };
}

function TableDrop({ resource, reservations, dragging, onSelect, style }: { resource: any; reservations: any[]; dragging: any; onSelect: (reservation: any) => void; style?: CSSProperties }) {
  const state = getFloorSnapshotState(resource, reservations);
  const capacity = Math.max(1, Number(resourceCapacity(resource) || 1));
  const name = resourceName(resource);
  const partySize = Math.max(1, Number(dragging?.party_size || 1));
  const validFit = !dragging || capacity >= partySize;
  const canDrop = Boolean(dragging && validFit && (state.available || state.reservation?.id === dragging.id));
  const visualType = resourceVisualType(resource);
  const { isOver, setNodeRef } = useDroppable({
    id: `resource:${resource.id || resource.layout_item_id || name}`,
    data: { kind: "resource", resource, canDrop },
    disabled: Boolean(dragging && !canDrop),
  });
  const turn = state.reservation?.seated_at ? (() => {
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(state.reservation.seated_at).getTime()) / 60000));
    return Number.isFinite(elapsed) ? `${elapsed}m` : null;
  })() : null;
  const shape = visualType === "booth"
    ? "rounded-[24px]"
    : visualType === "private"
      ? "rounded-[16px]"
      : visualType === "patio"
        ? "rounded-full"
        : capacity <= 4
          ? "rounded-full"
          : "rounded-[16px]";
  const displayStatus = state.reservation
    ? getReservationGuestName(state.reservation).split(" ")[0]
    : state.status === "Open" ? "Open" : state.status;

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      onClick={() => state.reservation && onSelect(state.reservation)}
      title={`${name} · ${capacity} seats · ${state.status}`}
      className={`${style ? "absolute" : "relative"} group flex items-center justify-center overflow-visible border transition-all duration-200 ${shape} ${statusClass(state.status)} ${
        dragging ? canDrop ? "ring-2 ring-blue-400/65" : "opacity-30 saturate-50" : ""
      } ${isOver && canDrop ? "z-20 scale-[1.05] border-blue-300 bg-blue-500/20 ring-4 ring-blue-400/45 shadow-[0_0_38px_rgba(59,130,246,0.28)]" : ""}`}
    >
      {visualType === "booth" ? (
        <>
          <span aria-hidden="true" className="absolute inset-x-2 top-2 h-[28%] rounded-[18px] bg-current/14 shadow-inner" />
          <span aria-hidden="true" className="absolute inset-x-3 bottom-2 h-[16%] rounded-full bg-black/25" />
        </>
      ) : null}

      {visualType === "private" ? (
        <>
          <span className="absolute left-3 top-2 text-[8px] font-black uppercase tracking-[0.16em] text-white/30">Private</span>
          <span aria-hidden="true" className="absolute inset-2 rounded-[12px] border border-dashed border-current/20" />
        </>
      ) : null}

      {visualType !== "booth" && visualType !== "private" ? Array.from({ length: Math.min(capacity, 12) }).map((_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="absolute h-2.5 w-2.5 rounded-[3px] border border-current/45 bg-[#080a0d] shadow-[0_2px_6px_rgba(0,0,0,0.35)]"
          style={chairStyle(index, Math.min(capacity, 12))}
        />
      )) : null}

      <span className="relative z-10 flex max-w-[86%] flex-col items-center justify-center text-center">
        <strong className="max-w-full truncate text-[11px] font-black tracking-tight text-white sm:text-xs">{name}</strong>
        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-black/24 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.07em] text-current">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {displayStatus}
        </span>
        <span className="mt-1 text-[9px] font-bold text-white/48">{capacity} seats{turn ? ` · ${turn}` : ""}</span>
      </span>
    </button>
  );
}

function BarSeatDrop({ parent, seatNumber, reservations, dragging, onSelect }: { parent: any; seatNumber: number; reservations: any[]; dragging: any; onSelect: (reservation: any) => void }) {
  const name = resourceName(parent);
  const type = normalizedType(parent).startsWith("counter") ? "counter_seat" : "bar_seat";
  const resource = {
    item_name: `${name} Seat ${seatNumber}`,
    item_type: type,
    capacity: 1,
    capacity_max: 1,
    location_id: parent.location_id,
  };
  const state = getFloorSnapshotState(resource, reservations);
  const canDrop = Boolean(dragging && (state.available || state.reservation?.id === dragging.id));
  const { isOver, setNodeRef } = useDroppable({
    id: `bar:${name}:${seatNumber}`,
    data: { kind: "resource", resource, canDrop },
    disabled: Boolean(dragging && !canDrop),
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => state.reservation && onSelect(state.reservation)}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[10px] font-black transition ${statusClass(state.status)} ${
        dragging ? canDrop ? "ring-1 ring-emerald-400/50" : "opacity-30" : ""
      } ${isOver && canDrop ? "scale-110 ring-2 ring-emerald-300" : ""}`}
      title={`${resource.item_name} · ${state.status}`}
    >
      {seatNumber}
    </button>
  );
}

function DraggableGuest({ item, kind = "reservation", selected, onClick }: { item: any; kind?: "reservation" | "waitlist"; selected?: boolean; onClick?: () => void }) {
  const id = kind === "waitlist" ? `waitlist:${item.id}` : `reservation:${item.id}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, data: { kind, item } });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const name = kind === "waitlist" ? item.contact_name || item.customer_name || "Walk-in guest" : getReservationGuestName(item);
  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      onClick={onClick}
      {...listeners}
      {...attributes}
      className={`w-full touch-none rounded-xl border px-3 py-2.5 text-left transition ${
        selected ? "border-[#e1062a]/60 bg-[#e1062a]/12" : "border-white/10 bg-white/[0.035] hover:bg-white/[0.065]"
      } ${isDragging ? "z-50 opacity-30" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-black text-white">{name}</p>
          <p className="mt-0.5 truncate text-[10px] font-bold text-white/45">
            {kind === "waitlist" ? "Waitlist" : formatReservationTime(item.reservation_time)}
            {item.bookable_item_name ? ` · ${item.bookable_item_name}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[10px] font-black text-white/70">
          {Math.max(1, Number(item.party_size || 1))}
        </span>
      </div>
    </button>
  );
}

function ServiceMetric({ label, value, warning }: { label: string; value: string | number; warning?: boolean }) {
  return (
    <div className={`min-w-[108px] rounded-2xl border px-4 py-3 shadow-[0_14px_35px_rgba(0,0,0,0.18)] ${warning ? "border-[#e1062a]/35 bg-[linear-gradient(145deg,rgba(225,6,42,0.16),rgba(225,6,42,0.05))]" : "border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))]"}`}>
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/38">{label}</p>
      <p className={`mt-1 text-lg font-black tracking-tight ${warning ? "text-[#ff8aa0]" : "text-white"}`}>{value}</p>
    </div>
  );
}

function StaffSwitcher({ locationId, staff, session, onChanged }: { locationId: string; staff: any[]; session: any; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function verify() {
    if (!selected || !/^\d{4,6}$/.test(pin)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/v1/reserve/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify_pin", locationId, staffProfileId: selected.id, pin }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to sign in.");
      setOpen(false); setSelected(null); setPin(""); onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to sign in."); }
    finally { setBusy(false); }
  }
  async function logout() {
    await fetch("/api/v1/reserve/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout", locationId }) });
    onChanged();
  }
  return (
    <>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-white/12 bg-white/[0.05] px-3 py-2 text-xs font-black text-white">
          {session?.profile?.display_name || "Staff sign in"}
        </button>
        {session ? <button type="button" onClick={logout} title="Sign out staff" className="rounded-full border border-white/10 p-2 text-white/50 hover:text-white"><LogOut size={14} /></button> : null}
      </div>
      {open ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-[1.75rem] border border-white/10 bg-[#0a0c10] p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">Quick switch</p><h2 className="mt-1 text-xl font-black">Who is using this device?</h2></div><button onClick={() => setOpen(false)}><X size={18} /></button></div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {staff.filter((person) => person.can_quick_switch !== false).map((person) => (
                <button key={person.id} type="button" onClick={() => { setSelected(person); setPin(""); setError(""); }} className={`rounded-xl border p-3 text-left ${selected?.id === person.id ? "border-[#e1062a]/60 bg-[#e1062a]/12" : "border-white/10 bg-white/[0.035]"}`}>
                  <p className="text-sm font-black">{person.display_name}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white/40">{String(person.role || "staff").replaceAll("_", " ")}</p>
                </button>
              ))}
            </div>
            {selected ? <div className="mt-4"><label className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45">4–6 digit PIN</label><input autoFocus inputMode="numeric" pattern="[0-9]*" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(e) => e.key === "Enter" && void verify()} className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-center text-2xl font-black tracking-[0.35em] outline-none focus:border-[#e1062a]/70" />{error ? <p className="mt-2 text-xs font-bold text-[#ff8aa0]">{error}</p> : null}<button disabled={busy || !/^\d{4,6}$/.test(pin)} onClick={verify} className="mt-3 w-full rounded-xl bg-[#e1062a] px-4 py-3 text-sm font-black text-white disabled:opacity-40">{busy ? "Signing in…" : "Sign in"}</button></div> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function ReserveEnterpriseHostView({ initialLocationId = "" }: { initialLocationId?: string }) {
  const searchParams = useSearchParams();
  const locationId = initialLocationId || clean(searchParams.get("adminLocationId")) || clean(searchParams.get("locationId"));
  const date = clean(searchParams.get("date")) || localDate();
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [railMode, setRailMode] = useState<"arriving" | "waitlist" | "seated">("arriving");
  const [railOpen, setRailOpen] = useState(true);
  const [floorFocus, setFloorFocus] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [dragging, setDragging] = useState<any>(null);
  const [dragKind, setDragKind] = useState<"reservation" | "waitlist" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageBusy, setMessageBusy] = useState(false);
  const [threadRefresh, setThreadRefresh] = useState(0);
  const [staffData, setStaffData] = useState<any>({ staff: [], session: null });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const loadStaff = useCallback(async () => {
    if (!locationId) return;
    try {
      const response = await fetch(`/api/v1/reserve/staff?locationId=${encodeURIComponent(locationId)}`, { cache: "no-store" });
      const data = await response.json();
      if (response.ok) setStaffData(data);
    } catch { /* service stays usable without staff quick-switch */ }
  }, [locationId]);

  const load = useCallback(async (silent = false) => {
    if (!locationId) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/v1/reserve/host/snapshot?locationId=${encodeURIComponent(locationId)}&date=${encodeURIComponent(date)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load Host View.");
      setSnapshot(data); setError(""); setOffline(false); setLastSync(data.generatedAt || new Date().toISOString());
      try { localStorage.setItem(cacheKey(locationId, date), JSON.stringify({ savedAt: new Date().toISOString(), data })); } catch {}
      if (data.settings?.floor_focus_default) setFloorFocus(true);
    } catch (err) {
      let restored = false;
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey(locationId, date)) || "null");
        if (cached?.data) { setSnapshot(cached.data); setLastSync(cached.savedAt || cached.data.generatedAt || null); setOffline(true); restored = true; }
      } catch {}
      setError(restored ? "Offline — showing the last synchronized service snapshot. Seating changes are paused until connection returns." : err instanceof Error ? err.message : "Unable to load Host View.");
    } finally { setLoading(false); }
  }, [locationId, date]);

  useEffect(() => { void load(false); void loadStaff(); }, [load, loadStaff]);
  useEffect(() => {
    const online = () => void load(true);
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [load]);
  useEffect(() => {
    if (!locationId || offline) return;
    const timer = window.setInterval(() => void load(true), 20_000);
    return () => window.clearInterval(timer);
  }, [locationId, offline, load]);

  const reservations = snapshot?.reservations || [];
  const waitlist = snapshot?.waitlist || [];
  const resources = snapshot?.resources || [];
  const activeReservations = reservations.filter((r: any) => ACTIVE.has(String(r.status || "").toLowerCase()));
  const arriving = activeReservations.filter((r: any) => !["seated", "occupied"].includes(String(r.status || "").toLowerCase()));
  const seated = activeReservations.filter((r: any) => ["seated", "occupied"].includes(String(r.status || "").toLowerCase()));
  const seatedCovers = seated.reduce((sum: number, r: any) => sum + Math.max(1, Number(r.party_size || 1)), 0);
  const arrivingCovers = arriving.reduce((sum: number, r: any) => sum + Math.max(1, Number(r.party_size || 1)), 0);
  const uniqueResources = Array.from(
    new Map(
      resources.map((resource: any) => {
        const identity = [
          normalizedType(resource),
          resourceName(resource).toLowerCase(),
          resourceCapacity(resource),
        ];
        const semanticKey = isBarResource(resource)
          ? identity.join(":")
          : [...identity, resourceLayoutValue(resource, "x"), resourceLayoutValue(resource, "y")].join(":");
        return [semanticKey, resource];
      }),
    ).values(),
  ) as any[];
  const tableResources = uniqueResources.filter((r: any) => !isBarResource(r));
  const barResources = uniqueResources.filter((r: any) => isBarResource(r));
  const floorWidth = Math.max(
    960,
    ...uniqueResources.map((resource: any) => resourceLayoutValue(resource, "x") + resourceLayoutValue(resource, "width") + 32),
  );
  const floorHeight = Math.max(
    620,
    ...uniqueResources.map((resource: any) => resourceLayoutValue(resource, "y") + resourceLayoutValue(resource, "height") + 32),
  );
  const queueItems = railMode === "arriving" ? arriving : railMode === "waitlist" ? waitlist : seated;

  async function handleDragEnd(event: DragEndEvent) {
    const activeData = event.active.data.current as any;
    const overData = event.over?.data.current as any;
    setDragging(null); setDragKind(null);
    if (!activeData?.item || !overData?.resource || !overData?.canDrop || offline) return;
    const item = activeData.item;
    const resource = overData.resource;
    setBusy(true); setError("");
    try {
      const endpoint = activeData.kind === "waitlist" ? "/api/v1/reserve/host/seat-waitlist" : "/api/v1/reserve/host/assign";
      const payload = activeData.kind === "waitlist" ? {
        locationId,
        waitlistId: item.id,
        resourceId: resource.id || resource.layout_item_id || null,
        resourceLabel: resourceName(resource),
      } : {
        locationId,
        reservationId: item.id,
        resource_id: resource.id || resource.layout_item_id || null,
        resource_label: resourceName(resource),
        seat_after_assign: true,
      };
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to seat this guest.");
      setSelected(data.reservation || item);
      await load(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to seat this guest."); }
    finally { setBusy(false); }
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as any;
    setDragging(data?.item || null); setDragKind(data?.kind || null);
  }

  async function sendMessage(text = message) {
    if (!selected || !text.trim() || offline) return;
    setMessageBusy(true); setError("");
    try {
      const channel = selected.customer_phone ? "sms" : "email";
      const response = await fetch("/api/reserve/portal/reservations/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservation_id: selected.id, location_id: selected.location_id || locationId, channel, message: text.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to message this guest.");
      setMessage(""); setThreadRefresh((value) => value + 1);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to message this guest."); }
    finally { setMessageBusy(false); }
  }

  if (!locationId) return <div className="p-8 text-sm font-bold text-white/60">Choose a location to open Host View.</div>;
  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragCancel={() => { setDragging(null); setDragKind(null); }} onDragEnd={(event) => void handleDragEnd(event)}>
      <main className="min-h-[calc(100vh-48px)] bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,0.09),transparent_31%),linear-gradient(180deg,#080a0e_0%,#050607_48%,#040506_100%)] text-white">
        <div className="sticky top-12 z-50 border-b border-white/[0.07] bg-[#07090d]/92 px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-2xl sm:px-6">
          <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <button type="button" onClick={() => setRailOpen((value) => !value)} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-white/65 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white">{railOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</button>
              <div><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.75)]" /><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff6b86]">Live service command center</p></div><p className="mt-1 truncate text-lg font-black tracking-tight">{date} <span className="text-white/30">·</span> Host floor</p></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ServiceMetric label="Seated" value={`${seated.length} · ${seatedCovers}`} />
              <ServiceMetric label="Arriving" value={`${arriving.length} · ${arrivingCovers}`} />
              <ServiceMetric label="Waiting" value={waitlist.length} />
              <ServiceMetric label="Attention" value={snapshot?.attention?.length || 0} warning={Boolean(snapshot?.attention?.length)} />
              <button type="button" onClick={() => setFloorFocus((value) => !value)} className={`grid h-11 w-11 place-items-center rounded-xl border transition ${floorFocus ? "border-[#e1062a]/50 bg-[#e1062a]/12 text-[#ff8aa0]" : "border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.07] hover:text-white"}`} title="Floor focus">{floorFocus ? <Minimize2 size={16} /> : <Expand size={16} />}</button>
              <button type="button" disabled={loading} onClick={() => void load(false)} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white/65 transition hover:bg-white/[0.07] hover:text-white disabled:opacity-40" title="Refresh"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
              <StaffSwitcher locationId={locationId} staff={staffData.staff || []} session={staffData.session} onChanged={() => void loadStaff()} />
            </div>
          </div>
          {error ? <div className={`mt-2 rounded-xl border px-3 py-2 text-xs font-bold ${offline ? "border-amber-300/30 bg-amber-400/10 text-amber-100" : "border-[#e1062a]/35 bg-[#e1062a]/10 text-[#ff9bad]"}`}>{error}</div> : null}
        </div>

        <div className="mx-auto max-w-[1800px] space-y-4 px-4 py-4 sm:px-6">
          {!floorFocus && railOpen ? (
            <section className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] shadow-[0_20px_55px_rgba(0,0,0,0.22)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-xl border border-[#e1062a]/30 bg-[#e1062a]/10 text-[#ff6b86]"><UsersRound size={17} /></div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">Reservation queue</p>
                      <span className="text-[10px] font-bold text-white/35">Drag reservations to a table · click for details</span>
                    </div>
                    <p className="mt-0.5 text-xs font-semibold text-white/45">{arriving.length} arriving · {waitlist.length} waiting · {seated.length} seated</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/25 p-1">
                  {(["arriving", "waitlist", "seated"] as const).map((mode) => (
                    <button key={mode} type="button" onClick={() => setRailMode(mode)} className={`rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-[0.08em] transition ${railMode === mode ? "bg-[#e1062a] text-white shadow-[0_8px_20px_rgba(225,6,42,0.22)]" : "text-white/45 hover:bg-white/[0.05] hover:text-white"}`}>
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 overflow-x-auto p-4 sm:p-5">
                {queueItems.map((item: any) => (
                  <div key={item.id} className="w-[260px] shrink-0">
                    <DraggableGuest item={item} kind={railMode === "waitlist" ? "waitlist" : "reservation"} selected={selected?.id === item.id} onClick={() => railMode !== "waitlist" && setSelected(item)} />
                  </div>
                ))}
                {!queueItems.length ? (
                  <div className="grid min-h-24 w-full place-items-center rounded-2xl border border-dashed border-white/10 bg-black/15 px-4 text-center">
                    <div><p className="text-sm font-black text-white/55">Nothing here right now.</p><p className="mt-1 text-xs font-semibold text-white/30">Guests will appear here in real time.</p></div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-[1.8rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.05),rgba(255,255,255,0.016))] shadow-[0_24px_70px_rgba(0,0,0,0.26)]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-4 sm:px-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff6b86]">Floor plan</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight">Seat the room with confidence</h1>
                <p className="mt-1 text-xs font-semibold text-white/40">Drag a reservation to any available table or bar seat. Live availability updates automatically.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/45"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.65)]" /> Open</div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/45"><span className="h-2.5 w-2.5 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.65)]" /> Selected</div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/45"><span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.65)]" /> Arriving / held</div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/45"><span className="h-2.5 w-2.5 rounded-full bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.65)]" /> Occupied</div>
                <div className="ml-1 flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black text-emerald-200">
                  {offline ? <><AlertTriangle size={12} /> Offline</> : <><span className="h-2 w-2 rounded-full bg-emerald-400" /> Live</>}
                  {lastSync ? ` · ${new Date(lastSync).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
                </div>
              </div>
            </div>

            {snapshot?.pacing?.warnings?.length ? <div className="flex gap-2 overflow-x-auto border-b border-white/[0.06] px-4 py-3 sm:px-5">{snapshot.pacing.warnings.map((warning: any, index: number) => <div key={`${warning.startMinute}-${warning.windowMinutes}-${index}`} className="shrink-0 rounded-xl border border-amber-300/25 bg-amber-300/8 px-3 py-2 text-[10px] font-black text-amber-100"><AlertTriangle size={12} className="mr-1 inline" /> {warning.covers} covers / {warning.windowMinutes}m · limit {warning.limit}</div>)}</div> : null}

            <div className="relative overflow-x-auto bg-[radial-gradient(circle_at_50%_0%,rgba(225,6,42,0.09),transparent_28%),linear-gradient(180deg,#0a0c10_0%,#07090c_100%)] p-3 sm:p-5">
              <div className="relative mx-auto min-w-[980px] overflow-hidden rounded-[1.4rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.028),rgba(255,255,255,0.01))] shadow-inner" style={{ aspectRatio: `${floorWidth} / ${floorHeight}` }}>
                <div className="pointer-events-none absolute inset-0 opacity-[0.14]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#e1062a]/[0.035] to-transparent" />

                {barResources.map((bar: any) => {
                  const barStyle = floorItemStyle(bar, floorWidth, floorHeight);
                  return (
                    <div key={`bar-${bar.id || resourceName(bar)}`} className="absolute z-10 overflow-visible" style={barStyle}>
                      <div className="absolute inset-x-0 top-0 h-[48px] rounded-[14px] border border-[#e1062a]/35 bg-[linear-gradient(180deg,rgba(225,6,42,0.14),rgba(255,255,255,0.035))] shadow-[0_12px_30px_rgba(0,0,0,0.28)]">
                        <div className="flex h-full items-center justify-between px-4">
                          <div>
                            <p className="text-xs font-black text-white">{resourceName(bar)}</p>
                            <p className="mt-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-white/35">Bar · {resourceCapacity(bar)} seats</p>
                          </div>
                          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-emerald-200">Open</span>
                        </div>
                      </div>
                      <div className="absolute left-1/2 top-[55px] flex -translate-x-1/2 items-center gap-2">
                        {Array.from({ length: Math.max(1, Number(resourceCapacity(bar) || 1)) }).map((_, index) => <BarSeatDrop key={index} parent={bar} seatNumber={index + 1} reservations={reservations} dragging={dragging} onSelect={setSelected} />)}
                      </div>
                    </div>
                  );
                })}

                {tableResources.map((resource: any) => (
                  <TableDrop key={resource.id || resource.layout_item_id || `${resourceName(resource)}-${resourceLayoutValue(resource, "x")}-${resourceLayoutValue(resource, "y")}`} resource={resource} reservations={reservations} dragging={dragging} onSelect={setSelected} style={floorItemStyle(resource, floorWidth, floorHeight)} />
                ))}

                {!uniqueResources.length ? <div className="absolute inset-5 grid place-items-center rounded-2xl border border-dashed border-white/10 text-sm font-bold text-white/35">No floor resources configured.</div> : null}
              </div>
            </div>

            {!floorFocus && snapshot?.serverRanking?.length ? <div className="flex gap-2 overflow-x-auto border-t border-white/[0.07] px-4 py-3 sm:px-5">{snapshot.serverRanking.map((entry: any) => <div key={entry.staff.id} className="shrink-0 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2"><p className="text-xs font-black">{entry.staff.display_name}</p><p className="mt-0.5 text-[9px] font-bold text-white/40">{entry.load.currentCovers} covers · {entry.load.tables} tables · +{entry.load.upcomingCovers} soon</p></div>)}</div> : null}
          </section>
        </div>

        {selected ? <div className="fixed inset-y-0 right-0 z-[80] w-full max-w-md overflow-y-auto border-l border-white/10 bg-[linear-gradient(180deg,rgba(12,14,18,0.99),rgba(7,9,12,0.99))] p-5 shadow-[-28px_0_70px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">Reservation</p><h2 className="mt-1 text-2xl font-black">{getReservationGuestName(selected)}</h2><p className="mt-1 text-xs font-bold text-white/45">{formatReservationTime(selected.reservation_time)} · Party {selected.party_size || 1}{selected.bookable_item_name ? ` · ${selected.bookable_item_name}` : ""}</p></div><button type="button" onClick={() => setSelected(null)} className="rounded-full border border-white/10 p-2 text-white/55"><X size={16} /></button></div>
          <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl border border-white/10 bg-white/[0.035] p-3"><p className="text-[9px] font-black uppercase tracking-[0.1em] text-white/35">Status</p><p className="mt-1 text-sm font-black capitalize">{String(selected.status || "confirmed").replaceAll("_", " ")}</p></div><div className="rounded-xl border border-white/10 bg-white/[0.035] p-3"><p className="text-[9px] font-black uppercase tracking-[0.1em] text-white/35">Server</p><p className="mt-1 text-sm font-black">{snapshot?.staff?.find((person: any) => person.id === selected.server_staff_profile_id)?.display_name || "Unassigned"}</p></div></div>
          <div className="mt-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Quick message</p><div className="mt-2 flex flex-wrap gap-2">{["Your table is ready. Please check in with the host.", "We’re running about 10 minutes behind. Thank you for your patience.", "Are you still planning to join us?", "Please check in with the host when you arrive."].map((template) => <button key={template} disabled={offline || messageBusy} onClick={() => void sendMessage(template)} className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-[10px] font-black text-white/70 hover:border-[#e1062a]/40">{template.split(".")[0]}</button>)}</div><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message guest…" className="mt-3 min-h-24 w-full rounded-xl border border-white/15 bg-black/30 p-3 text-sm font-semibold outline-none placeholder:text-white/25 focus:border-[#e1062a]/60" /><button disabled={offline || messageBusy || !message.trim()} onClick={() => void sendMessage()} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#e1062a] px-4 py-2.5 text-xs font-black text-white disabled:opacity-40"><MessageSquare size={14} /> {messageBusy ? "Sending…" : "Send message"}</button></div>
          <ReserveConversationThread reservation={selected} refreshKey={threadRefresh} />
          {snapshot?.events?.some((event: any) => event.reservation_id === selected.id) ? <div className="mt-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Activity</p><div className="mt-2 space-y-2">{snapshot.events.filter((event: any) => event.reservation_id === selected.id).slice(0, 8).map((event: any) => <div key={event.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-2.5"><p className="text-xs font-black text-white/80">{String(event.event_type || "Activity").replaceAll("_", " ").replaceAll(".", " · ")}</p><p className="mt-0.5 text-[9px] font-bold text-white/35">{new Date(event.created_at).toLocaleString()}</p></div>)}</div></div> : null}
        </div> : null}

        {busy ? <div className="fixed bottom-5 left-1/2 z-[90] -translate-x-1/2 rounded-full border border-white/15 bg-black/90 px-4 py-2 text-xs font-black shadow-2xl"><RefreshCw size={13} className="mr-2 inline animate-spin" /> Updating floor…</div> : null}
      </main>
      <DragOverlay>{dragging ? <div className="w-52 rounded-xl border border-[#e1062a]/45 bg-[#111318] px-3 py-2 shadow-2xl"><p className="text-xs font-black text-white">{dragKind === "waitlist" ? dragging.contact_name || dragging.customer_name : getReservationGuestName(dragging)}</p><p className="mt-1 text-[10px] font-bold text-white/45">Party {dragging.party_size || 1} · release on a highlighted seat</p></div> : null}</DragOverlay>
    </DndContext>
  );
}
