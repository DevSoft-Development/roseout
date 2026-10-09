import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  AdminActionButton,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "@/lib/admin-design-system";

export const dynamic="force-dynamic";

async function countRows(table:string, configure?:(query:any)=>any){
  try{
    let query=getAdminDatabaseClient().from(table).select("id",{count:"exact",head:true});
    if(configure) query=configure(query);
    const {count,error}=await query;
    if(error) return null;
    return Number(count||0);
  }catch{return null;}
}

export default async function PosOperationsPage(){
  await requireAdminRole(["superadmin","admin","manager"]);
  const [devices,activeAssignments,readyDevices,offlineDevices,pendingCommands,deadLetters]=await Promise.all([
    countRows("pos_hardware_devices"),
    countRows("pos_hardware_assignments",(q)=>q.eq("assignment_status","active")),
    countRows("pos_hardware_devices",(q)=>q.eq("health_status","ready")),
    countRows("pos_hardware_devices",(q)=>q.eq("health_status","offline")),
    countRows("pos_location_commands",(q)=>q.in("status",["pending","leased"])),
    countRows("pos_location_commands",(q)=>q.eq("status","dead_letter")),
  ]);
  const healthy=(deadLetters||0)===0;
  let monitoring: Record<string,any>|null=null;
  try {
    const {data,error}=await getAdminDatabaseClient().from("cron_job_runs")
      .select("status,started_at,details,error_message")
      .eq("job_key","pos-location-readiness")
      .order("started_at",{ascending:false}).limit(1).maybeSingle();
    if(!error && data) monitoring=data;
  } catch { /* Monitoring remains unavailable until staged activation. */ }
  const runDetails = (monitoring?.details && typeof monitoring.details==="object")
    ? monitoring.details as Record<string,any> : {};
  const monitorCounts = (runDetails.counts || runDetails.response?.counts || null) as Record<string,number>|null;

  const workspaces=[
    ["POS Hardware Inventory","Receive, assign, replace, and track ThePOSHaven devices.","/admin/dashboard/settings/location-tools/pos-hardware/inventory","Hardware"],
    ["Location POS Management","Open a business location in CRM, then enter its owner workspace to manage POS settings and hardware.","/admin/dashboard/crm","Locations"],
    ["Plans & Entitlements","Manage Essentials+ and Signature+ commercial access from the plan system.","/admin/dashboard/plans","Plans"],
    ["Platform Operations","Review production runtime, background services, incidents, and operational health.","/admin/dashboard/infrastructure/operations","Platform"],
  ] as const;

  return <AdminPageShell>
    <AdminPageHeader
      eyebrow="ThePOSHaven"
      title="POS Operations"
      subtitle="Admin control center for ThePOSHaven hardware, merchant access, device health, command delivery, and support."
      badge={<AdminStatusBadge tone={healthy?"green":"amber"}>{healthy?"POS control plane healthy":`${deadLetters} command failures need attention`}</AdminStatusBadge>}
      actions={<>
        <AdminActionButton href="/admin/dashboard/settings/location-tools/pos-hardware/inventory" variant="primary">Hardware Inventory</AdminActionButton>
        <AdminActionButton href="/admin/dashboard/crm">Locations CRM</AdminActionButton>
      </>}
    />

    <AdminKpiGrid>
      <AdminKpiCard label="POS devices" value={devices==null?"—":devices.toLocaleString()} helper="Registered hardware" />
      <AdminKpiCard label="Active assignments" value={activeAssignments==null?"—":activeAssignments.toLocaleString()} helper="Devices assigned to locations" />
      <AdminKpiCard label="Ready" value={readyDevices==null?"—":readyDevices.toLocaleString()} helper="Reporting healthy" />
      <AdminKpiCard label="Offline" value={offlineDevices==null?"—":offlineDevices.toLocaleString()} helper="Need reconnection or review" />
      <AdminKpiCard label="Command queue" value={pendingCommands==null?"—":pendingCommands.toLocaleString()} helper="Pending or currently leased" />
      <AdminKpiCard label="Dead letters" value={deadLetters==null?"—":deadLetters.toLocaleString()} helper="Delivery failures requiring support" />
    </AdminKpiGrid>

    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <h2 className="text-xl font-black">Opening-aware POS fleet readiness</h2>
      <p className="mt-2 text-sm text-white/60">Closed restaurants are expected offline; unknown operating hours never generate an alert.</p>
      {monitoring ? (
        <div className="mt-3 text-sm">
          <p>Latest monitored run: {String(monitoring.status)} · {String(monitoring.started_at||"Time unavailable")}</p>
          {monitorCounts ? <p>Healthy {monitorCounts.healthy??0} · Expected offline {monitorCounts.expected_offline??0} · Awaiting startup {monitorCounts.awaiting_startup??0} · Needs attention {monitorCounts.needs_attention??0} · Unknown {monitorCounts.unknown??0}</p> : <p>Awaiting monitoring summary.</p>}
          {monitoring.error_message ? <p className="text-amber-300">{String(monitoring.error_message)}</p> : null}
        </div>
      ) : <p className="mt-3 text-sm text-amber-200">Monitoring is staged; awaiting the first AWS-managed run.</p>}
    </section>

    <section className="grid gap-4 md:grid-cols-2">
      {workspaces.map(([title,body,href,badge])=><Link key={href} href={href} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-rose-200/30 hover:bg-white/[0.065]">
        <span className="inline-flex rounded-full border border-rose-200/20 bg-rose-500/10 px-3 py-1 text-xs font-black text-rose-50">{badge}</span>
        <h2 className="mt-4 text-xl font-black">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-white/55">{body}</p>
      </Link>)}
    </section>

    <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
      <p className="text-xs font-black uppercase tracking-[.2em] text-rose-200">Product boundary</p>
      <h2 className="mt-1 text-xl font-black">Admin manages the fleet. Merchants run the POS.</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
        The live cashier, table-service, KDS, offline, and Signature+ workflows run in the dedicated ThePOSHaven app. Admin provides fleet management, support, health, entitlement, and merchant-entry points without duplicating the cashier interface.
      </p>
    </section>
  </AdminPageShell>;
}
