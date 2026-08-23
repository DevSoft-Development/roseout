import Link from "next/link";
import { notFound } from "next/navigation";
import PostcardSocialFollowupForm from "@/components/marketing/PostcardSocialFollowupForm";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function PostcardSocialFollowupPage({ params }: { params: Promise<{ locationId: string }> }) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const { locationId } = await params;
  const [{ data: location }, { data: task }, { data: mailItem }] = await Promise.all([
    supabaseAdmin.from("locations").select("id,name,business_name,restaurant_name,activity_name,address,city,state,instagram_url,facebook_url,tiktok_url,claim_status,is_claimed,claimed,claim_approved_at").eq("id", locationId).maybeSingle(),
    supabaseAdmin.from("crm_tasks").select("id,title,status,priority,due_at,assigned_to_user_id,metadata").eq("location_id", locationId).eq("category", "marketing").eq("subtype", "postcard_social_follow").in("status", ["open", "in_progress", "blocked"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("mailing_batch_items").select("id,batch_id,mailed_at,business_name,status").eq("location_id", locationId).not("mailed_at", "is", null).order("mailed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!location) notFound();

  const name = location.name || location.business_name || location.restaurant_name || location.activity_name || "Location";
  const claimed = Boolean(location.is_claimed || location.claimed || location.claim_approved_at || ["claimed", "approved", "verified"].includes(String(location.claim_status || "").toLowerCase()));
  const assignedToMe = !task?.assigned_to_user_id || task.assigned_to_user_id === admin.user_id;

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Marketing · Postcard Follow-up</p>
          <h1 className="text-3xl font-semibold">{name}</h1>
          <p className="mt-1 text-sm text-neutral-600">{[location.address, location.city, location.state].filter(Boolean).join(", ")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/dashboard/crm/locations/${locationId}`} className="min-h-11 rounded-xl border px-4 py-2.5 text-sm font-semibold">Open CRM location</Link>
          <Link href="/admin/dashboard/marketing/today" className="min-h-11 rounded-xl border px-4 py-2.5 text-sm font-semibold">Marketing Today</Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-4"><div className="text-xs font-semibold uppercase text-neutral-500">Postcard</div><div className="mt-1 font-semibold">{mailItem?.mailed_at ? `Mailed ${new Date(mailItem.mailed_at).toLocaleDateString()}` : "No mailed postcard found"}</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-xs font-semibold uppercase text-neutral-500">Claim status</div><div className="mt-1 font-semibold capitalize">{claimed ? "Claimed" : String(location.claim_status || "Unclaimed").replaceAll("_", " ")}</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-xs font-semibold uppercase text-neutral-500">Task</div><div className="mt-1 font-semibold capitalize">{task ? String(task.status).replaceAll("_", " ") : "No open task"}</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-xs font-semibold uppercase text-neutral-500">Due</div><div className="mt-1 font-semibold">{task?.due_at ? new Date(task.due_at).toLocaleString("en-US", { timeZone: "America/New_York" }) : "—"}</div></div>
      </div>

      {!assignedToMe ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">This follow-up is assigned to another employee. You can review the location, but leave the task completion to its assignee unless reassigned in CRM.</div> : null}
      {claimed ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">This location is already claimed. Social profiles can still be verified, but additional claim outreach should stop.</div> : null}

      <PostcardSocialFollowupForm
        locationId={locationId}
        taskId={task?.id || null}
        initialInstagram={location.instagram_url}
        initialFacebook={location.facebook_url}
        initialTikTok={location.tiktok_url}
      />
    </main>
  );
}
