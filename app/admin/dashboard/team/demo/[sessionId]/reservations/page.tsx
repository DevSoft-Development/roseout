import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatDateTime, labelize } from "@/lib/team-tools";
import { formatFullAddress } from "@/lib/address-utils";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sessionId: string }> };

export default async function DemoReservationPreview({ params }: Props) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.dashboard);
  const { sessionId } = await params;
  const [{ data: session }, { data: locations = [] }] = await Promise.all([
    supabaseAdmin.from("crm_demo_sessions").select("*").eq("id", sessionId).maybeSingle(),
    supabaseAdmin.from("crm_demo_session_locations").select("*").eq("demo_session_id", sessionId).order("created_at"),
  ]);
  if (!session) notFound();

  return (
    <main className="px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin/dashboard/team/demo" className="text-sm font-black text-rose-200">← Demo / Training</Link>
        <div className="mt-6 rounded-3xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm font-black text-amber-100">
          DEMO MODE — Training only. No real booking will be created, no customer SMS/email will be sent, and real inventory is not blocked.
        </div>
        <h1 className="mt-6 text-3xl font-black">Demo reservation workspace</h1>
        <p className="mt-2 text-sm font-bold text-white/55">
          Session {session.id} · {labelize(session.session_type)} · {labelize(session.status)} · Expires {formatDateTime(session.expires_at)}
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {(locations || []).map((location: any) => (
            <article key={location.id} className="rounded-3xl border border-white/10 bg-[#111] p-5">
              <p className="text-xs font-black uppercase tracking-widest text-rose-300">Editable demo copy</p>
              <h2 className="mt-1 text-xl font-black">{location.display_name}</h2>
              <p className="mt-2 text-sm text-white/55">{formatFullAddress({ address: location.address, city: location.city, state: location.state, zip_code: location.zip_code })}</p>
              <p className="mt-3 rounded-2xl border border-white/10 bg-black/35 p-3 text-xs font-bold text-white/55">
                Reservation layout edits for this demo should use location_source=demo_session and demo_session_id={session.id}. This page intentionally does not write to public.locations.
              </p>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
