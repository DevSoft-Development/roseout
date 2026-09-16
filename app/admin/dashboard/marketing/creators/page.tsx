import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function money(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return `$${Number(value).toLocaleString()}`;
}

export default async function CreatorsPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const [{ data: creators }, { data: partnerships }, { data: filmingTasks }] = await Promise.all([
    supabaseAdmin.from("gtm_creator_sources").select("id,creator_key,display_name,platform,status,metadata,created_at").order("created_at", { ascending: false }).limit(200),
    supabaseAdmin.from("social_creator_partnerships").select("id,creator_source_id,status,campaign_name,payment_model,flat_fee,per_business_fee,commission_percent,commission_months,tracking_key,updated_at").order("updated_at", { ascending: false }).limit(200),
    supabaseAdmin.from("crm_tasks").select("id,title,status,priority,due_at,contact_id,metadata").eq("category", "marketing").eq("subtype", "creator_filming_task").is("archived_at", null).order("created_at", { ascending: false }).limit(100),
  ]);
  const creatorById = new Map((creators || []).map((creator: any) => [creator.id, creator]));

  return <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-[1400px] space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-300">Social Manager</p><h1 className="mt-2 text-4xl font-semibold">Creators</h1><p className="mt-2 max-w-2xl text-white/55">Turn creator interest into a clear partnership, tracking link, and filming assignment without spreadsheets.</p></div><Link href="/admin/dashboard/marketing/social-manager" className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold">Back to Social Manager</Link></div>

    <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-semibold">Set up a creator partnership</h2><p className="mt-1 text-sm text-white/45">Choose the creator, campaign, and how they’ll be paid. TheOutHaven creates the tracking key automatically.</p><form action="/api/admin/marketing/creators/partnership" method="post" className="mt-5 grid gap-4 lg:grid-cols-3">
      <label className="grid gap-1.5 text-sm"><span className="text-white/60">Creator</span><select name="creator_source_id" required className="rounded-xl border border-white/10 bg-black/30 px-3 py-3"><option value="">Choose creator</option>{(creators||[]).map((creator:any)=><option key={creator.id} value={creator.id}>{creator.display_name} · {creator.platform || "social"}</option>)}</select></label>
      <label className="grid gap-1.5 text-sm"><span className="text-white/60">Campaign</span><input name="campaign_name" required placeholder="Friday Night Launch" className="rounded-xl border border-white/10 bg-black/30 px-3 py-3"/></label>
      <label className="grid gap-1.5 text-sm"><span className="text-white/60">Payment</span><select name="payment_model" className="rounded-xl border border-white/10 bg-black/30 px-3 py-3"><option value="flat">Flat payment</option><option value="per_business">Payment per business</option><option value="commission">Commission</option><option value="hybrid">Flat + performance</option><option value="custom">Custom</option></select></label>
      <label className="grid gap-1.5 text-sm"><span className="text-white/60">Flat payment</span><input name="flat_fee" type="number" min="0" step="0.01" placeholder="500" className="rounded-xl border border-white/10 bg-black/30 px-3 py-3"/></label>
      <label className="grid gap-1.5 text-sm"><span className="text-white/60">Per paying business</span><input name="per_business_fee" type="number" min="0" step="0.01" placeholder="150" className="rounded-xl border border-white/10 bg-black/30 px-3 py-3"/></label>
      <label className="grid gap-1.5 text-sm"><span className="text-white/60">Commission %</span><input name="commission_percent" type="number" min="0" max="100" step="0.01" placeholder="20" className="rounded-xl border border-white/10 bg-black/30 px-3 py-3"/></label>
      <label className="grid gap-1.5 text-sm"><span className="text-white/60">Commission length</span><select name="commission_months" className="rounded-xl border border-white/10 bg-black/30 px-3 py-3"><option value="">Not set</option><option value="3">3 months</option><option value="6">6 months</option><option value="12">12 months</option></select></label>
      <label className="lg:col-span-2 grid gap-1.5 text-sm"><span className="text-white/60">Notes</span><input name="notes" placeholder="What they’re creating, special terms, or campaign details" className="rounded-xl border border-white/10 bg-black/30 px-3 py-3"/></label>
      <label className="flex items-center gap-3 rounded-xl border border-white/10 p-4 text-sm"><input type="checkbox" name="create_filming_task" value="true" defaultChecked/><span>Create a filming task too</span></label>
      <button className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold lg:col-span-2">Create Partnership</button>
    </form></section>

    <section className="grid gap-5 xl:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/[0.05]"><div className="border-b border-white/10 p-5"><h2 className="font-semibold">Partnerships</h2></div><div className="divide-y divide-white/10">{(partnerships||[]).map((item:any)=>{const creator=creatorById.get(item.creator_source_id) as any;return <div key={item.id} className="p-5"><div className="flex justify-between gap-3"><div><p className="font-medium">{creator?.display_name || "Creator"}</p><p className="mt-1 text-sm text-white/45">{item.campaign_name || "Campaign"} · {String(item.status).replaceAll("_"," ")}</p></div><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold capitalize">{String(item.payment_model).replaceAll("_"," ")}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-sm text-white/55 sm:grid-cols-4"><span>Flat {money(item.flat_fee)}</span><span>Per business {money(item.per_business_fee)}</span><span>Commission {item.commission_percent == null ? "—" : `${item.commission_percent}%`}</span><span>{item.commission_months ? `${item.commission_months} months` : "No term"}</span></div>{item.tracking_key?<p className="mt-3 rounded-xl bg-black/20 p-3 text-xs text-white/50">Tracking key: {item.tracking_key}</p>:null}</div>})}{!partnerships?.length?<div className="p-8 text-center text-sm text-white/45">No creator partnerships yet.</div>:null}</div></div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.05]"><div className="border-b border-white/10 p-5"><h2 className="font-semibold">Filming tasks</h2><p className="mt-1 text-sm text-white/45">Simple instructions for the person creating the video.</p></div><div className="divide-y divide-white/10">{(filmingTasks||[]).map((task:any)=><div key={task.id} className="p-5"><div className="flex justify-between gap-3"><div><p className="font-medium">{task.title}</p><p className="mt-1 text-sm text-white/45">{task.metadata?.video_length || "20–25 seconds"}</p></div><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold capitalize">{task.status.replaceAll("_"," ")}</span></div><ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-white/60">{(task.metadata?.shots || ["Show the entrance","Show the food or main feature","Show the activity","Show the vibe","Record a closing shot"]).map((shot:string)=><li key={shot}>{shot}</li>)}</ol></div>)}{!filmingTasks?.length?<div className="p-8 text-center text-sm text-white/45">No filming tasks yet.</div>:null}</div></div></section>
  </div></main>;
}
