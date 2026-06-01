import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
type LocationType = "restaurants" | "activities";

async function getLocation(type: LocationType, id: string) {
  const table = type === "restaurants" ? "restaurants" : "activities";
  const { data } = await supabase.from(table).select("id, name, restaurant_name, activity_name, city, state").eq("id", id).maybeSingle();
  return data;
}

export default async function AdminLocationSubPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.crm);
  const { type, id } = await params;
  if (type !== "restaurants" && type !== "activities") notFound();
  const location = await getLocation(type, id);
  if (!location) notFound();
  const name = String(location.restaurant_name || location.activity_name || location.name || "Untitled");
  const back = `/admin/dashboard/locations/${type}/${id}`;

  return <main className="min-h-screen bg-[#090706] px-4 pb-10 pt-5 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-[1200px] space-y-5"><Link href={back} className="inline-flex rounded-full border border-white/10 bg-[#120d0b] px-4 py-2 text-sm font-bold text-white/80">← Back to CRM Detail</Link><section className="rounded-[2rem] border border-white/10 bg-[#120d0b] p-6 shadow-2xl"><p className="text-xs uppercase tracking-[0.25em] text-rose-200">Admin Workspace</p><h1 className="mt-2 text-3xl font-black">{name}</h1><p className="mt-2 text-white/60">{String(location.city || "")} {location.state ? `, ${String(location.state)}` : ""}</p></section><section className="grid gap-4 md:grid-cols-2"><article className="rounded-[1.5rem] border border-white/10 bg-[#1b1210] p-5"><h2 className="text-lg font-black">Action Queue</h2><p className="mt-2 text-sm text-white/60">No items yet. Start by creating a task for this location.</p><button className="mt-4 rounded-full border border-white/10 bg-[#120d0b] px-4 py-2 text-xs font-bold">Create Task</button></article><article className="rounded-[1.5rem] border border-white/10 bg-[#1b1210] p-5"><h2 className="text-lg font-black">Notes & History</h2><p className="mt-2 text-sm text-white/60">No notes yet. Add context for the next admin follow-up.</p><button className="mt-4 rounded-full border border-white/10 bg-[#120d0b] px-4 py-2 text-xs font-bold">Add Note</button></article></section></div></main>;
}
