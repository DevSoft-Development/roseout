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
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function metadataValue(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function routingStatus(metadata: unknown) {
  return metadataValue(metadata, "routing_status");
}

function inboundPhone(metadata: unknown) {
  return metadataValue(metadata, "inbound_phone") || metadataValue(metadata, "phone");
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
        .limit(50),
      supabaseAdmin
        .from("crm_activities")
        .select("id,location_id,activity_type,direction,channel,summary,body,occurred_at,created_at")
        .in("activity_type", ["call", "phone_call", "claim_invitation", "follow_up", "social_outreach", "site_visit"])
        .order("occurred_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("crm_conversations")
        .select("id,location_id,status,is_unread,unread_count,last_message_at,metadata")
        .is("archived_at", null)
        .order("last_message_at", { ascending: false, nullsFirst: false })
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
    const smsConversationIds = new Set<string>();

    for (const row of messages || []) {
      const conversationId = String((row as any).conversation_id || "");
      const conversation: any = conversationMap.get(conversationId);
      const locationId = conversation?.location_id ? String(conversation.location_id) : null;
      const channel = String((row as any).channel || "message").toLowerCase();
      const direction = String((row as any).direction || "").toLowerCase() || null;
      const timestamp = String((row as any).delivered_at || (row as any).sent_at || (row as any).created_at);

      if (channel === "sms" && conversationId) {
        if (smsConversationIds.has(conversationId)) continue;
        smsConversationIds.add(conversationId);

        const phone = inboundPhone(conversation?.metadata);
        const unmatchedSms = routingStatus(conversation?.metadata) === "unmatched";
        const href = unmatchedSms || !locationId
          ? `/admin/dashboard/crm/communications/unmatched?conversation=${encodeURIComponent(conversationId)}`
          : `/admin/dashboard/crm/${locationId}?tab=communications`;

        feed.push({
          id: `conversation:${conversationId}`,
          locationId,
          locationName: locationId ? locationMap.get(locationId) || null : null,
          channel: "sms",
          direction,
          title: phone ? `Text conversation · ${phone}` : "Text conversation",
          preview: String((row as any).body_text || "").slice(0, 180),
          status: String(conversation?.status || (row as any).status || "") || null,
          unread: Boolean(conversation?.is_unread),
          timestamp: String(conversation?.last_message_at || timestamp),
          href,
        });
        continue;
      }

      const title = (row as any).subject
        ? String((row as any).subject)
        : `${direction === "inbound" ? "Received" : "Sent"} ${label(channel)}`;

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
        href: locationId ? `/admin/dashboard/crm/${locationId}?tab=communications` : "/admin/dashboard/crm/notifications",
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
        href: locationId ? `/admin/dashboard/crm/${locationId}` : "/admin/dashboard/crm/notifications",
      });
    }

    feed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({
      items: feed.slice(0, 30),
      unreadCount: (conversations || []).filter((row: any) => row.is_unread).length,
      waitingCount: (conversations || []).filter((row: any) => ["waiting_on_rep", "waiting_on_team", "open", "new"].includes(String(row.status || "").toLowerCase()) || row.is_unread).length,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load communications." }, { status: 403 });
  }
}
