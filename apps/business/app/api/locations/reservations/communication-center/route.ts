import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value || "").trim();
}

function metadataValue(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const access = await getLocationOwnerAccess(user.id, user.email ?? null);
    const url = new URL(req.url);
    const requestedLocationId = clean(url.searchParams.get("locationId"));

    const canonicalIds = new Set(access.ownedLocationIds);
    const sourceToCanonical = new Map<string, string>();
    if (access.ownedSourceLocationIds.length) {
      const { data: canonicalFromSources } = await supabaseAdmin
        .from("locations")
        .select("id,source_id")
        .in("source_id", access.ownedSourceLocationIds);
      for (const row of canonicalFromSources || []) {
        if (!row.id) continue;
        const canonicalId = String(row.id);
        canonicalIds.add(canonicalId);
        if (row.source_id) sourceToCanonical.set(String(row.source_id), canonicalId);
      }
    }

    let requestedCanonicalId = requestedLocationId;
    if (requestedLocationId && !canonicalIds.has(requestedLocationId)) {
      requestedCanonicalId = sourceToCanonical.get(requestedLocationId) || requestedLocationId;
    }

    if (requestedLocationId) {
      if (!access.isAdmin && !canonicalIds.has(requestedCanonicalId)) {
        return NextResponse.json({ error: "You do not have access to this location." }, { status: 403 });
      }
      if (access.isAdmin) canonicalIds.add(requestedCanonicalId);
    }

    const allowedLocationIds = requestedLocationId
      ? Array.from(canonicalIds).filter((id) => id === requestedCanonicalId)
      : Array.from(canonicalIds);

    if (!access.isAdmin && allowedLocationIds.length === 0) {
      return NextResponse.json({ items: [], unreadCount: 0, waitingCount: 0 });
    }

    let conversationQuery = supabaseAdmin
      .from("crm_conversations")
      .select("id,conversation_key,location_id,reservation_id,assigned_team,channel,status,subject,is_unread,unread_count,last_message_at,metadata")
      .not("reservation_id", "is", null)
      .is("archived_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);

    if (allowedLocationIds.length) conversationQuery = conversationQuery.in("location_id", allowedLocationIds);
    else if (access.isAdmin && !requestedLocationId) {
      return NextResponse.json({ error: "Choose a location before viewing owner reservation communications." }, { status: 400 });
    }

    const { data: conversations, error: conversationError } = await conversationQuery;
    if (conversationError) throw conversationError;

    const conversationIds = (conversations || []).map((row: any) => String(row.id));
    const conversationMap = new Map((conversations || []).map((row: any) => [String(row.id), row]));

    const { data: messages, error: messageError } = conversationIds.length
      ? await supabaseAdmin
          .from("crm_messages")
          .select("id,conversation_id,direction,channel,subject,body_text,status,sent_at,delivered_at,created_at")
          .in("conversation_id", conversationIds)
          .is("archived_at", null)
          .order("created_at", { ascending: false })
          .limit(100)
      : { data: [] as any[], error: null };
    if (messageError) throw messageError;

    const locationIds = Array.from(new Set((conversations || []).map((row: any) => String(row.location_id || "")).filter(Boolean)));
    const { data: locations } = locationIds.length
      ? await supabaseAdmin.from("locations").select("id,name,location_name").in("id", locationIds)
      : { data: [] as any[] };
    const locationMap = new Map((locations || []).map((row: any) => [String(row.id), String(row.name || row.location_name || "Location")]));

    const seen = new Set<string>();
    const items: any[] = [];
    for (const row of messages || []) {
      const conversationId = String((row as any).conversation_id || "");
      if (!conversationId || seen.has(conversationId)) continue;
      seen.add(conversationId);
      const conversation: any = conversationMap.get(conversationId);
      if (!conversation) continue;
      const locationId = String(conversation.location_id || "") || null;
      const reservationId = String(conversation.reservation_id || "") || null;
      const channel = String((row as any).channel || conversation.channel || "message").toLowerCase();
      const direction = String((row as any).direction || "").toLowerCase() || null;
      const timestamp = String((row as any).delivered_at || (row as any).sent_at || conversation.last_message_at || (row as any).created_at);
      const phone = metadataValue(conversation.metadata, "customer_phone");

      items.push({
        id: `conversation:${conversationId}`,
        locationId,
        locationName: locationId ? locationMap.get(locationId) || null : null,
        channel,
        direction,
        title: String((row as any).subject || conversation.subject || (phone ? `Reservation conversation · ${phone}` : "Reservation conversation")),
        preview: String((row as any).body_text || "").slice(0, 180),
        status: String(conversation.status || (row as any).status || "") || null,
        unread: Boolean(conversation.is_unread),
        timestamp,
        href: `/locations/dashboard/reservations${locationId ? `?locationId=${encodeURIComponent(locationId)}${reservationId ? `&reservationId=${encodeURIComponent(reservationId)}` : ""}` : ""}`,
      });
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const scoped = conversations || [];
    return NextResponse.json({
      items: items.slice(0, 30),
      unreadCount: scoped.filter((row: any) => row.is_unread).length,
      waitingCount: scoped.filter((row: any) => ["waiting_on_rep", "waiting_on_team", "open", "new"].includes(String(row.status || "").toLowerCase()) || row.is_unread).length,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load reservation communications." }, { status: 500 });
  }
}
