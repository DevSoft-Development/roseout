import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function MarketingTodayPage() {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [taskResult, scheduledResult, approvalResult, failureResult] = await Promise.all([
    supabaseAdmin.from("crm_tasks").select("id,title,status,priority,due_at,subtype,metadata").eq("category", "marketing").eq("assigned_to_user_id", admin.user_id).is("archived_at", null).in("status", ["open", "in_progress", "blocked"]).order("due_at", { ascending: true, nullsFirst: false }).limit(100),
    supabaseAdmin.from("marketing_content_items").select("id,title,status,publish_at,selected_platforms,auto_publish").gte("publish_at", dayStart.toISOString()).lt("publish_at", dayEnd.toISOString()).neq("status", "archived").order("publish_at"),
    supabaseAdmin.from("marketing_approvals").select("id,content_item_id,version,created_at").eq("status", "pending").eq("assigned_to", admin.user_id).order("created_at", { ascending: true }).limit(30),
    supabaseAdmin.from("social_publish_jobs").select("id,provider,error_message,updated_at,social_posts(content_item_id,title,caption)").eq("status", "failed").order("updated_at", { ascending: false }).limit(20),
  ]);
  const tasks = taskResult.data || [];
  const scheduled = scheduledResult.data || [];
  const approvals = approvalResult.data || [];
  const failures = failureResult.data || [];
  const overdue = tasks.filter((task) => task.due_at && new Date(task.due_at).getTime() < Date.now());

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Marketing</p><h1 className="text-3xl font-semibold">Today</h1><p className="mt-1 text-sm text-neutral-600">Your assigned work, today’s publishing plan, approvals, and publishing failures.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-4"><div className="text-2xl font-semibold">{tasks.length}</div><div className="text-xs font-semibold uppercase text-neutral-500">My open tasks</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-2xl font-semibold">{overdue.length}</div><div className="text-xs font-semibold uppercase text-neutral-500">Overdue</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-2xl font-semibold">{scheduled.length}</div><div className="text-xs font-semibold uppercase text-neutral-500">Publishing today</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-2xl font-semibold">{failures.length}</div><div className="text-xs font-semibold uppercase text-neutral-500">Failed publishes</div></div>
      </div>
      <section className="rounded-2xl border bg-white"><div className="flex justify-between border-b px-4 py-3"><h2 className="font-semibold">My work</h2><Link href="/admin/dashboard/crm/my-work" className="text-sm font-semibold underline">CRM My Work</Link></div><div className="divide-y">{tasks.length ? tasks.map((task) => { const metadata = (task.metadata || {}) as Record<string, unknown>; const href = typeof metadata.deep_link === "string" ? metadata.deep_link : "/admin/dashboard/crm/my-work"; return <Link key={task.id} href={href} className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-neutral-50"><div><div className="font-medium">{task.title}</div><div className="text-xs capitalize text-neutral-500">{String(task.subtype || "marketing task").replaceAll("_", " ")}</div></div><div className="text-right"><div className={`text-xs font-semibold ${task.priority === "urgent" ? "text-red-700" : "text-neutral-600"}`}>{task.priority}</div><div className="text-xs text-neutral-500">{task.due_at ? new Date(task.due_at).toLocaleString("en-US", { timeZone: "America/New_York" }) : "No due date"}</div></div></Link>; }) : <div className="p-8 text-center text-sm text-neutral-500">No Marketing tasks assigned to you.</div>}</div></section>
      <section className="rounded-2xl border bg-white"><div className="border-b px-4 py-3 font-semibold">Publishing today</div><div className="divide-y">{scheduled.length ? scheduled.map((item) => <Link href={`/admin/dashboard/marketing/content/${item.id}`} key={item.id} className="flex min-h-16 justify-between gap-3 px-4 py-4 hover:bg-neutral-50"><div><div className="font-medium">{item.title}</div><div className="text-xs text-neutral-500">{(item.selected_platforms || []).join(", ")} · {item.auto_publish ? "automatic" : "manual"}</div></div><span className="text-sm font-semibold">{item.publish_at ? new Date(item.publish_at).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) : ""}</span></Link>) : <div className="p-8 text-center text-sm text-neutral-500">Nothing scheduled today.</div>}</div></section>
      {approvals.length ? <section className="rounded-2xl border bg-white"><div className="border-b px-4 py-3 font-semibold">My approvals</div><div className="divide-y">{approvals.map((approval) => <Link key={approval.id} href={`/admin/dashboard/marketing/content/${approval.content_item_id}/review`} className="flex min-h-16 items-center justify-between px-4 py-4 hover:bg-neutral-50"><span className="font-medium">Marketing content review</span><span className="text-xs text-neutral-500">Version {approval.version}</span></Link>)}</div></section> : null}
      {failures.length ? <section className="rounded-2xl border border-red-200 bg-white"><div className="border-b border-red-100 px-4 py-3 font-semibold text-red-800">Publishing failures</div><div className="divide-y">{failures.map((failure: any) => { const post = Array.isArray(failure.social_posts) ? failure.social_posts[0] : failure.social_posts; return <Link key={failure.id} href={post?.content_item_id ? `/admin/dashboard/marketing/content/${post.content_item_id}` : "/admin/dashboard/marketing/social-accounts"} className="block px-4 py-4 hover:bg-red-50"><div className="font-medium capitalize">{failure.provider}: {post?.title || post?.caption || "Social post"}</div><div className="text-xs text-red-700">{failure.error_message || "Publishing failed"}</div></Link>; })}</div></section> : null}
    </main>
  );
}
