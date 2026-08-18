import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type FeedItem = {
  id: string;
  locationId: string | null;
  locationName: string | null;
  channel: string;
  direction: string | null;
  title: string;
  preview: string;
  status: string | null;
  unread: boolean;
  timestamp: string;
  href: string;
};

function label(value: unknown) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function GET() {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.crm);

    const [{ data: messages, error: messageError }, { data: activities, error: activityError }, { data: conversations }] = await Promise.all([
      supabaseAdmin
        .from("crm_messages")
        .select("id,conversation_id,direction,channel,subject,body_text,status,sent_at,delivered_at,created_at")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(25),
      supabaseAdmin
        .from("crm_activities")
        .select("id,location_id,activity_type,direction,channel,summary,body,occurred_at,created_at")
        .in("activity_type", ["call", "phone_call", "claim_invitation", "follow_up", "social_outreach", "site_visit"])
        .order("occurred_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("crm_conversations")
        .select("id,location_id,status,is_unread,unread_count,last_message_at")
        .is("archived_at", null)
        .order("last_message_at", { ascending: false })
        .limit(100),
    ]);

    if (messageError) throw messageError;
    if (activityError) throw activityError;

    const conversationMap = new Map((conversations || []).map((row: any) => [String(row.id), row]));
    const locationIds = Array.from(new Set([
      ...(messages || []).map((row: any) => conversationMap.get(String(row.conversation_id))?.location_id),
      ...(activities || []).map((row: any) => row.location_id),
    ].filter(Boolean).map(String)));

    const { data: locations } = locationIds.length
      ? await supabaseAdmin.from("locations").select("id,name,location_name").in("id", locationIds)
      : { data: [] as any[] };
    const locationMap = new Map((locations || []).map((row: any) => [String(row.id), String(row.name || row.location_name || "Location")]));

    const feed: FeedItem[] = [];

    for (const row of messages || []) {
      const conversation: any = conversationMap.get(String((row as any).conversation_id));
      const locationId = conversation?.location_id ? String(conversation.location_id) : null;
      const channel = String((row as any).channel || "message").toLowerCase();
      const direction = String((row as any).direction || "").toLowerCase() || null;
      const title = (row as any).subject
        ? String((row as any).subject)
        : `${direction === "inbound" ? "Received" : "Sent"} ${channel === "sms" ? "text" : label(channel)}`;
      const timestamp = String((row as any).delivered_at || (row as any).sent_at || (row as any).created_at);
      feed.push({
        id: `message:${(row as any).id}`,
        locationId,
        locationName: locationId ? locationMap.get(locationId) || null : null,
        channel,
        direction,
        title,
        preview: String((row as any).body_text || "").slice(0, 180),
        status: String((row as any).status || conversation?.status || "") || null,
        unread: Boolean(conversation?.is_unread && direction === "inbound"),
        timestamp,
        href: locationId ? `/admin/dashboard/crm/${locationId}?tab=communication` : "/admin/dashboard/crm/outreach",
      });
    }

    for (const row of activities || []) {
      const locationId = (row as any).location_id ? String((row as any).location_id) : null;
      const activityType = String((row as any).activity_type || "activity");
      feed.push({
        id: `activity:${(row as any).id}`,
        locationId,
        locationName: locationId ? locationMap.get(locationId) || null : null,
        channel: String((row as any).channel || activityType),
        direction: (row as any).direction ? String((row as any).direction) : null,
        title: String((row as any).summary || label(activityType)),
        preview: String((row as any).body || "").slice(0, 180),
        status: null,
        unread: false,
        timestamp: String((row as any).occurred_at || (row as any).created_at),
        href: locationId ? `/admin/dashboard/crm/${locationId}` : "/admin/dashboard/crm/outreach",
      });
    }

    feed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({
      items: feed.slice(0, 30),
      unreadCount: feed.filter((item) => item.unread).length,
      waitingCount: (conversations || []).filter((row: any) => ["waiting_on_rep", "open", "new"].includes(String(row.status || "").toLowerCase()) || row.is_unread).length,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load communications." }, { status: 403 });
  }
}
