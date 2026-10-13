import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { AdminPageHeader, AdminPageShell, AdminStatusBadge } from "@/lib/admin-design-system";

export const dynamic = "force-dynamic";
const enabled = process.env.POS_REMOTE_ASSIST_ENABLED === "true";

type AssistSession = {
  id: string; location_id: string; device_id: string; state: string;
  requested_at?: string | null; expires_at?: string | null;
  technician_id?: string | null;
};
type AssistEvent = {
  id: string; session_id: string; event_type?: string | null;
  created_at?: string | null; actor_id?: string | null;
};

export default async function RemoteAssistAdminPage() {
  await requireAdminRole(["superadmin", "admin", "manager"]);
  const db = getAdminDatabaseClient();
  const [sessionResult, eventResult] = await Promise.all([
    db.from("pos_remote_assist_sessions").select("*").order("created_at", { ascending: false }).limit(40),
    db.from("pos_remote_assist_events").select("*").order("created_at", { ascending: false }).limit(40),
  ]);
  const sessions = (sessionResult.data || []) as AssistSession[];
  const events = (eventResult.data || []) as AssistEvent[];
  const available = !sessionResult.error && !eventResult.error;
  return <AdminPageShell>
    <AdminPageHeader eyebrow="ThePOSHaven / Support" title="Remote Assist"
      subtitle="Read-only support oversight. Viewing requires customer consent, native screen-capture permission and a verified technician. Remote input is never allowed."
      badge={<AdminStatusBadge tone={enabled && available ? "amber" : "amber"}>{!available ? "Data unavailable" : enabled ? "Flag on - certification required" : "Production disabled"}</AdminStatusBadge>}
      actions={<Link href="/admin/dashboard/pos" className="rounded-lg border border-white/20 px-4 py-2 text-sm">POS Operations</Link>}
    />
    {!available ? <section role="alert" className="rounded-xl border border-amber-400/30 p-4 text-sm text-amber-200">
      Remote Assist data could not be loaded. Check shard migrations and Admin database access. No session actions are available.
    </section> : null}
    <section className="rounded-2xl border border-white/10 p-5">
      <h2 className="text-lg font-bold">Release safety</h2>
      <p className="mt-2 text-sm text-white/65">Admin can inspect session state and audit events here. Starting a session, generating a code, granting capture or joining a relay is intentionally unavailable until authenticated APIs, native capture, WebRTC revocation and physical-device certification are complete.</p>
      <p className="mt-2 text-sm text-white/65">Remote touch, reboot and POS control are prohibited.</p>
    </section>
    <section className="rounded-2xl border border-white/10 p-5">
      <h2 className="text-lg font-bold">Recent sessions ({sessions.length})</h2>
      <div className="mt-3 space-y-3">
        {sessions.map(s => <div key={s.id} className="rounded-xl border border-white/10 p-3 text-sm">
          <p className="font-semibold">{s.state || "unknown"} · {s.id}</p>
          <p className="mt-1 break-all text-white/60">Location {s.location_id} · Device {s.device_id}</p>
          <p className="mt-1 text-white/60">Expires {s.expires_at || "Not set"} · Technician {s.technician_id || "Not assigned"}</p>
        </div>)}
        {!sessions.length ? <p className="text-sm text-white/60">No sessions returned.</p> : null}
      </div>
    </section>
    <section className="rounded-2xl border border-white/10 p-5">
      <h2 className="text-lg font-bold">Recent audit events ({events.length})</h2>
      <div className="mt-3 space-y-2">
        {events.map(e => <div key={e.id} className="rounded-lg border border-white/10 p-3 text-xs">
          <p className="font-semibold">{e.event_type || "Event"} · {e.created_at || "Timestamp unavailable"}</p>
          <p className="mt-1 break-all text-white/60">Session {e.session_id} · Actor {e.actor_id || "System"}</p>
        </div>)}
        {!events.length ? <p className="text-sm text-white/60">No audit events returned.</p> : null}
      </div>
    </section>
  </AdminPageShell>;
}
