"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Plus, QrCode, RefreshCw, UserPlus } from "lucide-react";
import AdminActingAsLocationBanner from "@/components/admin/AdminActingAsLocationBanner";
import AdminLocationSearch from "@/components/admin/AdminLocationSearch";
import ReserveCommandCenterShell from "@/components/reserve/ReserveCommandCenterShell";
import ReserveMetricCard from "@/components/reserve/ReserveMetricCard";
import ReserveTabs from "@/components/reserve/ReserveTabs";
import ReserveTimeline from "@/components/reserve/ReserveTimeline";
import ReserveFloorSnapshot from "@/components/reserve/ReserveFloorSnapshot";
import ReserveGuestDetails from "@/components/reserve/ReserveGuestDetails";
import ReserveWaitlistPanel from "@/components/reserve/ReserveWaitlistPanel";
import ReserveHumanMessage from "@/components/reserve/ReserveHumanMessage";
import ReserveQuickActionButton from "@/components/reserve/ReserveQuickActionButton";
import ReserveEmptyState from "@/components/reserve/ReserveEmptyState";
import { formatReservationTime, getReservationStatusLabel } from "@/lib/reservations/ui";
import { formatShortDate } from "@/lib/reservations/reservationFormatting";
import { getBookingLink, getEmbedLink, getQrLink, reserveQuery } from "@/lib/reservations/reserveLinks";

type ReservationStatus = "pending"|"confirmed"|"checked_in"|"arrived"|"seated"|"waitlisted"|"declined"|"cancelled"|"completed"|"no_show";
type Reservation = Record<string, any> & { id:string; status:ReservationStatus; reservation_date:string; reservation_time:string; customer_name?:string; party_size?:number; location_id:string; location_type:string };
const statusTabs = ["all","pending","confirmed","checked_in","seated","completed","cancelled","no_show"];
function todayKey(date = new Date()) { return date.toISOString().split("T")[0]; }
function normalizeType(value: string | null) { const type = String(value || "restaurant").toLowerCase(); return type === "activities" ? "activity" : type; }
function addDays(dateKeyValue:string, amount:number){ const d=new Date(`${dateKeyValue}T12:00:00`); d.setDate(d.getDate()+amount); return todayKey(d); }
function friendlyError(value: unknown, fallback="We could not load this reservation view.") { return value instanceof Error ? value.message : fallback; }

export default function ReservePortalReservationsPage(){ return <Suspense fallback={<main className="reserve-command-center min-h-screen p-10">Loading Reserve Command Center…</main>}><ReservePortalReservationsContent /></Suspense>; }

function ReservePortalReservationsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const adminLocationId = searchParams.get("adminLocationId") || "";
  const locationId = adminLocationId || searchParams.get("locationId") || "";
  const locationType = normalizeType(searchParams.get("type"));
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "today");
  const [selectedDate, setSelectedDate] = useState(searchParams.get("date") || todayKey());
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [search, setSearch] = useState("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [message, setMessage] = useState<{tone:"success"|"error"|"warning"|"info"; text:string} | null>(null);
  const [adminSummary, setAdminSummary] = useState<any>(null);

  function switchTab(tab:string){ setActiveTab(tab); const q=reserveQuery({ adminLocationId: adminLocationId||undefined, locationId: !adminLocationId?locationId:undefined, type: locationType, tab, date:selectedDate }); router.replace(`/reserve/dashboard/reservations${q}`, { scroll:false }); }

  async function loadAll(){
    setLoading(true); setMessage(null);
    try {
      const params = new URLSearchParams({ filter:"upcoming" }); if(locationId){ params.set("locationId", locationId); params.set("type", locationType); if(adminLocationId) params.set("adminLocationId", adminLocationId); }
      const res = await fetch(`/api/reserve/portal/reservations?${params}`); const data = await res.json(); if(!res.ok) throw new Error(data.error || "Unable to load reservations.");
      const all = (data.reservations || []) as Reservation[]; setReservations(all);
      const rParams = new URLSearchParams({ locationId, date:selectedDate }); if(adminLocationId) rParams.set("adminLocationId", adminLocationId);
      if(locationId){
        const [resourceResponse, waitlistResponse] = await Promise.allSettled([fetch(`/api/reserve/portal/resources?${rParams}`), fetch(`/api/reservations/waitlist?${rParams}`)]);
        if(resourceResponse.status === "fulfilled"){ const rd=await resourceResponse.value.json(); setResources(resourceResponse.value.ok ? (rd.resources||[]) : []); }
        if(waitlistResponse.status === "fulfilled"){ const wd=await waitlistResponse.value.json(); setWaitlist(waitlistResponse.value.ok ? (wd.waitlist||[]) : []); }
      }
    } catch (error) { setMessage({ tone:"error", text:friendlyError(error) }); }
    finally { setLoading(false); }
  }

  async function updateStatus(reservation:Reservation, status:string){
    if(["cancelled","no_show","declined"].includes(status) && !window.confirm(`Mark this reservation as ${getReservationStatusLabel(status)}?`)) return;
    setUpdatingId(reservation.id); setMessage(null);
    try { const response = await fetch("/api/reserve/portal/reservations/update", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ reservation_id: reservation.id, location_id: reservation.location_id, location_type: reservation.location_type, status, adminLocationId: adminLocationId || undefined }) }); const data = await response.json(); if(!response.ok) throw new Error(data.error || "We could not update this reservation. Please try again."); setReservations((prev)=>prev.map((r)=>r.id===reservation.id?data.reservation:r)); setSelectedId(reservation.id); setMessage({ tone:"success", text: status === "confirmed" ? "Reservation confirmed." : status === "checked_in" ? "Guest checked in." : status === "seated" ? "Guest seated." : status === "completed" ? "Reservation completed." : `Reservation marked ${getReservationStatusLabel(status)}.` }); await loadAll(); }
    catch(error){ setMessage({ tone:"error", text:friendlyError(error, "We could not update this reservation. Please try again.") }); }
    finally { setUpdatingId(""); }
  }

  useEffect(()=>{ loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [locationId, locationType, adminLocationId, selectedDate]);
  useEffect(()=>{ if(!adminLocationId) return; fetch(`/api/admin/locations/${adminLocationId}/summary`).then(r=>r.json().then(d=>({r,d}))).then(({r,d})=>{ if(r.ok) setAdminSummary(d); }); }, [adminLocationId]);

  const dayReservations = useMemo(()=>reservations.filter((r)=>r.reservation_date === selectedDate), [reservations, selectedDate]);
  const filtered = useMemo(()=> dayReservations.filter((r)=> (statusFilter === "all" || r.status === statusFilter) && `${r.customer_name||""} ${r.customer_phone||""} ${r.customer_email||""} ${r.special_request||""}`.toLowerCase().includes(search.toLowerCase())), [dayReservations,statusFilter,search]);
  const selected = dayReservations.find((r)=>r.id === selectedId) || dayReservations.find((r)=>!["cancelled","completed","no_show","declined"].includes(r.status)) || dayReservations[0];
  const metrics = { pending: dayReservations.filter(r=>r.status==='pending').length, confirmed: dayReservations.filter(r=>r.status==='confirmed').length, arrived: dayReservations.filter(r=>r.status==='checked_in'||r.status==='arrived').length, seated: dayReservations.filter(r=>r.status==='seated').length, completed: dayReservations.filter(r=>r.status==='completed').length, noShow: dayReservations.filter(r=>r.status==='no_show').length };
  const setupEnabled = Boolean(locationId && (resources.length || dayReservations.length));
  const locationName = adminSummary?.location?.name || adminSummary?.location?.restaurant_name || "TheOutHaven location";

  const topActions = <><Link className="reserve-soft rounded-full px-4 py-2 text-sm font-black" href={getBookingLink(locationId, locationType) || "#"}>Booking page <ExternalLink className="inline" size={14}/></Link><Link className="reserve-soft rounded-full px-4 py-2 text-sm font-black" href={getEmbedLink(locationId) || "#"}>Embed</Link><Link className="reserve-soft rounded-full px-4 py-2 text-sm font-black" href={getQrLink(locationId) || "#"}><QrCode className="inline" size={14}/> QR Code</Link><ReserveQuickActionButton disabled title="Manual owner reservation creation needs backend support before it can be used."><Plus size={14} className="inline"/> New Reservation</ReserveQuickActionButton><ReserveQuickActionButton disabled title="Walk-in creation needs backend support before it can be used."><UserPlus size={14} className="inline"/> Walk-in</ReserveQuickActionButton></>;

  return <ReserveCommandCenterShell locationName={locationName} locationId={locationId} locationType={locationType} activeTab={activeTab} onTabChange={switchTab} actions={topActions} setupEnabled={setupEnabled} userLabel={adminLocationId ? "Admin location mode" : "Owner workspace"}>
    {adminLocationId && <><AdminActingAsLocationBanner locationId={adminLocationId} locationName={locationName} locationType={locationType} plan={adminSummary?.location?.plan} reservationAccess={adminSummary?.reservationAccess?.plan}/><div className="mb-4"><AdminLocationSearch compact /></div></>}
    {message && <div className="mb-4"><ReserveHumanMessage tone={message.tone}>{message.text}</ReserveHumanMessage></div>}
    {!locationId && <div className="mb-4"><ReserveHumanMessage tone="warning">Select a location to load live reservations, floor resources, booking links, and waitlist data.</ReserveHumanMessage></div>}

    <section className="reserve-card mb-5 rounded-[2rem] p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-black uppercase reserve-muted">Today controls</p><h2 className="text-2xl font-black">Today, {formatShortDate(new Date(`${selectedDate}T12:00:00`))}</h2></div><div className="flex flex-wrap gap-2"><button className="reserve-soft rounded-full p-3" onClick={()=>setSelectedDate(addDays(selectedDate,-1))}><ChevronLeft size={16}/></button><button className="reserve-primary rounded-full px-4 py-2 font-black" onClick={()=>setSelectedDate(todayKey())}>Today</button><button className="reserve-soft rounded-full p-3" onClick={()=>setSelectedDate(addDays(selectedDate,1))}><ChevronRight size={16}/></button><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="reserve-soft rounded-full px-4 py-2"><option value="all">All statuses</option>{statusTabs.slice(1).map(s=><option key={s} value={s}>{getReservationStatusLabel(s)}</option>)}</select><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search guest, phone, email, notes" className="reserve-soft rounded-full px-4 py-2"/><button onClick={loadAll} className="reserve-soft rounded-full px-4 py-2 font-black"><RefreshCw size={14} className="inline"/> Refresh</button></div></div></section>
    <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"><ReserveMetricCard label="Needs action" value={metrics.pending}/><ReserveMetricCard label="Ready for arrival" value={metrics.confirmed}/><ReserveMetricCard label="Guest arrived" value={metrics.arrived}/><ReserveMetricCard label="Seated now" value={metrics.seated}/><ReserveMetricCard label="Finished" value={metrics.completed}/><ReserveMetricCard label="Waitlist" value={waitlist.length}/><ReserveMetricCard label="No-shows" value={metrics.noShow}/></section>
    <div className="mb-5"><ReserveTabs active={activeTab} onChange={switchTab} tabs={["today","calendar","floor","guests","waitlist","settings"].map(t=>({label:t[0].toUpperCase()+t.slice(1), value:t}))}/></div>
    {activeTab === "today" && <div className="grid gap-5 xl:grid-cols-[1fr_380px]"><section className="reserve-card rounded-[2rem] p-5"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-black uppercase reserve-muted">Reservation timeline</p><h2 className="text-2xl font-black">{filtered.length} bookings</h2></div></div>{loading ? <ReserveEmptyState title="Loading reservations…" message="We’re checking the live reservation list."/> : filtered.length ? <ReserveTimeline reservations={filtered} selectedId={selected?.id} onSelect={(r)=>setSelectedId(r.id)} onStatus={updateStatus} updatingId={updatingId}/> : <ReserveEmptyState title="No reservations for this day." message="New bookings and changes will appear here automatically."/>}</section><div className="space-y-5"><ReserveFloorSnapshot resources={resources} reservations={dayReservations}/><ReserveGuestDetails reservation={selected} onStatus={updateStatus}/><ReserveWaitlistPanel entries={waitlist}/></div></div>}
    {activeTab === "floor" && <ReserveFloorSnapshot resources={resources} reservations={dayReservations}/>} {activeTab === "waitlist" && <ReserveWaitlistPanel entries={waitlist}/>} {activeTab === "guests" && <section className="reserve-card rounded-[2rem] p-5"><h2 className="text-2xl font-black">Guests</h2><ReserveTimeline reservations={filtered} selectedId={selected?.id} onSelect={(r)=>setSelectedId(r.id)} onStatus={updateStatus} updatingId={updatingId}/></section>} {activeTab === "calendar" && <section className="reserve-card rounded-[2rem] p-5"><h2 className="text-2xl font-black">Calendar volume</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from(new Set(reservations.map(r=>r.reservation_date))).slice(0,12).map(d=><button key={d} onClick={()=>{setSelectedDate(d);switchTab('today')}} className="reserve-soft rounded-2xl p-4 text-left"><CalendarDays size={18}/><p className="mt-2 font-black">{d}</p><p className="text-sm reserve-muted">{reservations.filter(r=>r.reservation_date===d).length} reservations</p></button>)}</div></section>} {activeTab === "settings" && <section className="reserve-card rounded-[2rem] p-5"><h2 className="text-2xl font-black">Reservation setup</h2><div className="mt-4 grid gap-3 md:grid-cols-3">{[["Layout & Tables","/reserve/dashboard/location-layout"],["Hours & Capacity","/reserve/dashboard/settings"],["Booking page",getBookingLink(locationId,locationType)],["Embed",getEmbedLink(locationId)],["QR code",getQrLink(locationId)],["Deposit & Policies","/reserve/dashboard/settings"]].map(([label,href])=><Link key={label} className="reserve-soft rounded-2xl p-4 font-black" href={href||"#"}>{label}</Link>)}</div></section>}
  </ReserveCommandCenterShell>;
}
