import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";
import { listSupportTickets } from "@/lib/support";

export const metadata: Metadata = { title: "Admin Dashboard", description: "Central admin overview for TheOutHaven." };
const todayKey = () => new Date().toISOString().split("T")[0];
const format = (v: number | null | undefined) => Number(v || 0).toLocaleString();

export default async function CentralDashboardPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);
  const today = todayKey();
  const [restaurants, activities, reservations, todayReservations, tickets] = await Promise.all([
    supabase.from("restaurants").select("id", { count: "exact", head: true }),
    supabase.from("activities").select("id", { count: "exact", head: true }),
    supabase.from("location_reservations").select("id", { count: "exact", head: true }),
    supabase.from("location_reservations").select("id", { count: "exact", head: true }).eq("reservation_date", today),
    listSupportTickets(12),
  ]);
  const openTickets = tickets.filter((t) => !["closed", "resolved"].includes(String(t.status || "").toLowerCase())).length;
  const groups = [
    {title:"Core Operations",desc:"Inventory and quality controls.",cards:[
      ["Locations","Manage all locations.","/admin/dashboard/locations"],["Add Location","Create a new listing.","/admin/dashboard/locations/new"],["Import","Run Google import.","/admin/dashboard/import"],["Data Quality","Fix bad records.","/admin/dashboard/locations/data-quality"],["Search Diagnostics","Validate discovery and search.","/admin/search-qa"]]},
    {title:"Claims & Owners",desc:"Owner onboarding and claim controls.",cards:[["Claim Review","Review incoming claims.","/admin/claims"],["Print Claim QRs","Print labels and cards.","/admin/dashboard/claim-qrs"],["Claim Tools","Audit and regenerate claims.","/admin/dashboard/claim-tools"],["Location Owners","Manage owner links.","/admin/dashboard/owner-accounts"],["Owner Accounts / Businesses","Owner business admin.","/admin/dashboard/owner-accounts"]]},
  ];
  return <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-4 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-[1500px] space-y-6"><section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.24),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6"><p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">TheOutHaven Admin</p><h1 className="mt-3 text-4xl font-black">TheOutHaven Admin</h1><p className="mt-3 max-w-3xl text-white/70">Manage locations, claims, reservations, analytics, support, imports, and owner operations from one clean control center.</p><div className="mt-5 flex flex-wrap gap-3">{[["Manage Locations","/admin/dashboard/locations",true],["Print Claim QRs","/admin/dashboard/claim-qrs",false],["Support Inbox","/admin/dashboard/support",false],["Analytics","/admin/dashboard/analytics",false]].map(([label,href,primary])=><Link key={String(label)} href={String(href)} className={primary?"rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black":"rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/80"}>{label}</Link>)}</div></section>
  <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Locations",format((restaurants.count||0)+(activities.count||0))],["Reservations",format(reservations.count)],["Today",format(todayReservations.count)],["Open Tickets",format(openTickets)]].map(([l,v])=><div key={String(l)} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"><p className="text-xs uppercase text-white/55">{l}</p><p className="mt-1 text-3xl font-black">{v}</p></div>)}</section>
  <div className="grid gap-6 xl:grid-cols-[1fr_360px]"> <div className="space-y-6">{groups.map(g=><section key={g.title}><h2 className="text-2xl font-black">{g.title}</h2><p className="text-sm text-white/60">{g.desc}</p><div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{g.cards.map(c=><Link key={c[0]} href={String(c[2])} className="rounded-3xl border border-[#eaded6] bg-[#f8f3ef] p-5 text-[#1b1210] transition hover:bg-rose-50"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-700">Admin Tool</p><h3 className="mt-2 text-xl font-black">{c[0]}</h3><p className="mt-2 text-sm text-[#4a3a35]">{c[1]}</p><span className="mt-4 inline-flex rounded-full bg-[#1b1210] px-3 py-1 text-xs font-black text-white">Open</span></Link>)}</div></section>)}</div>
  <aside className="rounded-3xl border border-white/10 bg-white/[0.05] p-5"><h3 className="text-lg font-black">Ticket Pulse</h3><p className="text-sm text-white/60">Latest support activity.</p></aside></div></div></main>;
}
