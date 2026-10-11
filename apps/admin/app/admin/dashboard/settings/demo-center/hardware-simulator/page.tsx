import Link from "next/link";
import {requireAdminRole} from "@theouthaven/auth/admin-session";
import {getAdminDatabaseClient} from "@theouthaven/db/admin-client";
import {AdminPageHeader,AdminPageShell,AdminStatusBadge} from "@/lib/admin-design-system";
import {provisionSimulator,runSimulatorScenario,resetSimulator} from "./actions";

export const dynamic="force-dynamic";
const LOCATION_ID="642a2ad6-c144-47b7-b9ff-f89554edf0da";
const SCENARIOS=[
 ["normal","Normal service","All devices respond within the heartbeat grace period"],
 ["printer_offline","Printer disconnect","Both printer types are offline during service"],
 ["morning_startup","Morning startup","Run at simulated 09:05 with startup grace"],
 ["after_hours","After hours","Run at simulated 02:00 with offline devices"],
 ["recovery","Restore connections","Bring offline devices online and resolve incidents"],
 ["repeat_outage","Repeat same outage","Replay identical outage; counters must not increase again"]
] as const;

export default async function HardwareSimulatorPage(){
 await requireAdminRole(["superadmin","admin"]);
 const db=getAdminDatabaseClient();
 const {data,error}=await db.from("pos_hardware_simulated_devices")
   .select("id,slot,kind,simulated_health,scenario,last_classification,incident_open,incident_count,recovery_count")
   .eq("location_id",LOCATION_ID).order("slot").limit(100);
 const devices=error?[]:data||[];
 const open=devices.filter(x=>x.incident_open).length;
 const counts=devices.reduce((sum,x)=>sum+Number(x.incident_count||0),0);
 const recoveries=devices.reduce((sum,x)=>sum+Number(x.recovery_count||0),0);
 return <AdminPageShell>
   <AdminPageHeader eyebrow="Admin Demo Center · POS" title="Hardware Simulator"
     subtitle="Virtual device health testing for the hidden TheOutHaven Lounge. No payments, physical device commands, or merchant notifications."
     badge={<AdminStatusBadge tone="amber">SIMULATED ONLY</AdminStatusBadge>}
     actions={<Link className="rounded-xl border border-white/20 px-4 py-2 text-sm" href="/admin/dashboard/settings/demo-center">Back to Demo Center</Link>}/>
   <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm">
     <strong>Safety boundary:</strong> these records are not added to real POS hardware inventory or live monitoring assignments.
     The current test validates the production classifier in isolation; it does not certify physical devices, live scanner pagination, or alert delivery.
   </div>
   <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
    {([["Virtual devices",devices.length],["Open test incidents",open],["Outage starts",counts],["Recoveries",recoveries]] as const).map(([label,value])=>
      <div key={label} className="rounded-xl border border-white/15 p-4">
        <div className="text-xs opacity-65">{label}</div><div className="mt-2 text-2xl font-bold">{value}</div>
      </div>)}
   </div>
   {error?<p className="rounded-xl border border-red-400/30 p-4 text-sm">Simulator database migration unavailable: {error.message}</p>:null}
   <section className="rounded-2xl border border-white/15 p-5">
     <h2 className="text-lg font-bold">Provision test equipment</h2>
     <p className="my-2 text-sm opacity-70">Create 20 virtual registers, printers, handhelds, hubs, and kitchen displays, each with unique simulator-only IDs.</p>
     <form action={provisionSimulator}><button className="rounded-xl bg-rose-600 px-4 py-2 font-bold text-white" type="submit">Provision 20 devices</button></form>
   </section>
   <section className="rounded-2xl border border-white/15 p-5">
     <h2 className="text-lg font-bold">Run device scenarios</h2>
     <p className="my-2 text-sm opacity-70">Simulated time is UTC: service hours 09:00–22:00 every day. Each scenario updates only test fixtures.</p>
     <div className="grid gap-3 md:grid-cols-2">
       {SCENARIOS.map(([scenario,title,description])=>
        <form key={scenario} action={runSimulatorScenario} className="rounded-xl border border-white/10 p-3">
          <input type="hidden" name="scenario" value={scenario}/>
          <h3 className="font-bold">{title}</h3><p className="my-2 text-xs opacity-70">{description}</p>
          <button type="submit" className="rounded-lg border border-rose-400/40 px-3 py-2 text-sm font-semibold">Run scenario</button>
        </form>)}
     </div>
   </section>
   <section className="rounded-2xl border border-white/15 p-5">
     <h2 className="text-lg font-bold">Virtual hardware ({devices.length})</h2>
     <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr><th className="py-2">Slot</th><th>Type</th><th>Health</th><th>Classification</th><th>Incidents</th><th>Recoveries</th></tr></thead>
      <tbody>{devices.map(device=><tr key={device.id} className="border-t border-white/10">
       <td className="py-2">{device.slot}</td><td>{device.kind.replaceAll("_"," ")}</td>
       <td>{device.simulated_health}</td><td>{device.last_classification}</td>
       <td>{device.incident_count}</td><td>{device.recovery_count}</td></tr>)}</tbody>
     </table></div>
   </section>
   <section className="rounded-2xl border border-red-300/20 p-5">
     <h2 className="font-bold">Reset simulation</h2>
     <p className="my-2 text-xs opacity-70">Remove virtual fixtures for the hidden demo location only. Live hardware is not touched.</p>
     <form action={resetSimulator}><button type="submit" className="rounded-lg border border-red-400/40 px-3 py-2 text-sm">Delete simulated devices</button></form>
   </section>
 </AdminPageShell>;
}
