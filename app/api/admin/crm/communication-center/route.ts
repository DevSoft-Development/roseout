import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type CommunicationScope = "crm" | "reservations" | "support";

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

function conversationScope(row: any): CommunicationScope {
  const assignedTeam = String(row?.assigned_team || "").toLowerCase();
  const contextType = String(metadataValue(row?.metadata, "context_type") || "").toLowerCase();
  const key = String(row?.conversation_key || "").toLowerCase();

  if (row?.reservation_id || assignedTeam === "reservations" || contextType === "reservation" || key.startsWith("reservation:")) {
    return "reservations";
  }

  if (
    ["support", "experience", "experience_team", "customer_support"].includes(assignedTeam) ||
    ["support", "ticket", "support_ticket"].includes(contextType) ||
    key.startsWith("support:") ||
    key.startsWith("ticket:")
  ) {
    return "support";
  }

  return "crm";
}

async function authorize(scope: CommunicationScope) {
  if (scope === "reservations") return requireAdminRole(ADMIN_PAGE_ACCESS.reservations);
  if (scope === "support") return requireAdminRole(ADMIN_PAGE_ACCESS.experienceInbox);
  return requireAdminRole(ADMIN_PAGE_ACCESS.crm);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const requestedScope = String(url.searchParams.get("scope") || "crm").toLowerCase();
    const scope: CommunicationScope = requestedScope === "reservations" || requestedScope === "support" ? requestedScope : "crm";
    await authorize(scope);

    const { data: conversations, error: conversationError } = await supabaseAdmin
      .from("crm_conversations")
      .select("id,conversation_key,location_id,reservation_id,assigned_team,channel,subject,status,is_unread,unread_count,last_message_at,metadata")
      .is("archived_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(250);

    if (conversationError) throw conversationError;

    const scopedConversations = (conversations || []).filter((row: any) => conversationScope(row) === scope);
    const scopedConversationIds = scopedConversations.map((row: any) => String(row.id));
    const conversationMap = new Map(scopedConversations.map((row: any) => [String(row.id), row]));

    const messagePromise = scopedConversationIds.length
      ? supabaseAdmin
          .from("crm_messages")
          .select("id,conversation_id,direction,channel,subject,body_text,status,source_system,sent_at,delivered_at,created_at")
          .in("conversation_id", scopedConversationIds)
          .is("archived_at", null)
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] as any[], error: null });

    const activityPromise = scope === "crm"
      ? supabaseAdmin
          .from("crm_activities")
          .select("id,location_id,activity_type,direction,channel,summary,body,occurred_at,created_at")
          .in("activity_type", ["call", "phone_call", "claim_invitation", "follow_up", "social_outreach", "site_visit"])
          .order("occurred_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as any[], error: null });

    const [{ data: messages, error: messageError }, { data: activities, error: activityError }] = await Promise.all([
      messagePromise,
      activityPromise,
    ]);

    if (messageError) throw messageError;
    if (activityError) throw activityError;

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
      if (!conversation) continue;
      const locationId = conversation?.location_id ? String(conversation.location_id) : null;
      const channel = String((row as any).channel || conversation?.channel || "message").toLowerCase();
      const direction = String((row as any).direction || "").toLowerCase() || null;
      const timestamp = String((row as any).delivered_at || (row as any).sent_at || (row as any).created_at);

      if (channel === "sms" && conversationId) {
        if (smsConversationIds.has(conversationId)) continue;
        smsConversationIds.add(conversationId);

        const phone = inboundPhone(conversation?.metadata);
        const unmatchedSms = routingStatus(conversation?.metadata) === "unmatched";
        const href = scope === "reservations"
          ? "/admin/dashboard/reservations"
          : scope === "support"
            ? "/admin/dashboard/support"
            : unmatchedSms || !locationId
              ? `/admin/dashboard/crm/communications/unmatched?conversation=${encodeURIComponent(conversationId)}`
              : `/admin/dashboard/crm/${locationId}?tab=communication&commTab=inbox`;

        feed.push({
          id: `conversation:${conversationId}`,
          locationId,
          locationName: locationId ? locationMap.get(locationId) || null : null,
          channel: "sms",
          direction,
          title: phone ? `Text conversation · ${phone}` : String(conversation?.subject || "Text conversation"),
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
        : String(conversation?.subject || `${direction === "inbound" ? "Received" : "Sent"} ${label(channel)}`);
      const href = scope === "reservations"
        ? "/admin/dashboard/reservations"
        : scope === "support"
          ? "/admin/dashboard/support"
          : locationId
            ? `/admin/dashboard/crm/${locationId}?tab=communication&commTab=inbox`
            : "/admin/dashboard/crm/notifications";

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
        href,
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
        href: locationId ? `/admin/dashboard/crm/${locationId}?tab=communication` : "/admin/dashboard/crm/notifications",
      });
    }

    feed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({
      scope,
      items: feed.slice(0, 30),
      unreadCount: scopedConversations.filter((row: any) => row.is_unread).length,
      waitingCount: scopedConversations.filter((row: any) => ["waiting_on_rep", "waiting_on_team", "open", "new"].includes(String(row.status || "").toLowerCase()) || row.is_unread).length,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load communications." }, { status: 403 });
  }
}
