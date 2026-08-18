import { supabaseAdmin } from "@/lib/supabase-admin";

export const CRM_MAIN_NUMBER = "+15162000701";

type RouteInboundParams = {
  from: string;
  to: string;
  body: string;
  eventId: string;
  providerMessageId: string | null;
  complianceKeyword?: "stop" | "start" | null;
};

type ContactRoute = {
  contactId: string;
  contactName: string;
  accountId: string | null;
  locationId: string | null;
};

async function findKnownContactRoute(from: string): Promise<ContactRoute | null> {
  const { data: contact, error: contactError } = await supabaseAdmin
    .from("crm_contacts")
    .select("id,full_name,first_name,last_name")
    .eq("phone_e164", from)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();

  if (contactError) throw contactError;
  if (!contact?.id) return null;

  const contactName =
    String(contact.full_name || "").trim() ||
    [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
    from;

  const { data: accountLinks, error: accountError } = await supabaseAdmin
    .from("crm_account_contacts")
    .select("account_id,is_primary")
    .eq("contact_id", contact.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(10);

  if (accountError) throw accountError;

  for (const link of accountLinks || []) {
    const { data: locationLink, error: locationError } = await supabaseAdmin
      .from("crm_account_locations")
      .select("location_id,is_primary_location")
      .eq("account_id", link.account_id)
      .eq("status", "active")
      .order("is_primary_location", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (locationError) throw locationError;
    if (locationLink?.location_id) {
      return {
        contactId: contact.id,
        contactName,
        accountId: link.account_id,
        locationId: locationLink.location_id,
      };
    }
  }

  return {
    contactId: contact.id,
    contactName,
    accountId: accountLinks?.[0]?.account_id || null,
    locationId: null,
  };
}

async function findPriorConversation(from: string) {
  const { data: recipientRows, error: recipientError } = await supabaseAdmin
    .from("crm_message_recipients")
    .select("message_id,created_at")
    .eq("address", from)
    .order("created_at", { ascending: false })
    .limit(20);

  if (recipientError) throw recipientError;
  if (!recipientRows?.length) return null;

  const { data: messages, error: messageError } = await supabaseAdmin
    .from("crm_messages")
    .select("conversation_id,created_at")
    .in("id", recipientRows.map((row) => row.message_id))
    .eq("channel", "sms")
    .eq("direction", "outbound")
    .eq("source_system", "crm_sms")
    .order("created_at", { ascending: false })
    .limit(1);

  if (messageError) throw messageError;
  return messages?.[0]?.conversation_id || null;
}

async function getOrCreateMatchedConversation(from: string, route: ContactRoute) {
  const priorConversationId = await findPriorConversation(from);
  if (priorConversationId) return priorConversationId;

  const conversationKey = route.locationId
    ? `sms:${route.locationId}:${from}`
    : `sms:contact:${route.contactId}:${from}`;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("crm_conversations")
    .select("id")
    .eq("conversation_key", conversationKey)
    .is("archived_at", null)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) return existing.id as string;

  const { data: created, error: createError } = await supabaseAdmin
    .from("crm_conversations")
    .insert({
      conversation_key: conversationKey,
      channel: "sms",
      status: "waiting_on_team",
      account_id: route.accountId,
      contact_id: route.contactId,
      location_id: route.locationId,
      assigned_team: "crm",
      priority: "normal",
      is_unread: true,
      unread_count: 0,
      metadata: {
        routing_status: "matched",
        contact_id: route.contactId,
        account_id: route.accountId,
        inbound_phone: from,
        telnyx_to: CRM_MAIN_NUMBER,
      },
    })
    .select("id")
    .single();

  if (createError || !created?.id) throw createError || new Error("Unable to create matched CRM SMS conversation");
  return created.id as string;
}

async function getOrCreateUnmatchedConversation(from: string) {
  const conversationKey = `sms:unmatched:${from}`;
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("crm_conversations")
    .select("id")
    .eq("conversation_key", conversationKey)
    .is("archived_at", null)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) return existing.id as string;

  const { data: created, error: createError } = await supabaseAdmin
    .from("crm_conversations")
    .insert({
      conversation_key: conversationKey,
      channel: "sms",
      status: "waiting_on_team",
      assigned_team: "crm",
      priority: "high",
      is_unread: true,
      unread_count: 0,
      metadata: {
        routing_status: "unmatched",
        inbound_phone: from,
        telnyx_to: CRM_MAIN_NUMBER,
      },
    })
    .select("id")
    .single();

  if (createError || !created?.id) throw createError || new Error("Unable to create unmatched CRM SMS conversation");
  return created.id as string;
}

function notificationValues(params: RouteInboundParams, knownRoute: ContactRoute | null, conversationId: string, messageId: string) {
  const notificationType = params.complianceKeyword
    ? "compliance_keyword"
    : knownRoute
      ? "inbound_sms"
      : "unmatched_sms";
  const actionHref = knownRoute?.locationId
    ? `/admin/dashboard/crm/${knownRoute.locationId}?tab=communications`
    : knownRoute
      ? `/admin/dashboard/crm/contacts?phone=${encodeURIComponent(params.from)}`
      : `/admin/dashboard/crm/communications/unmatched?conversation=${conversationId}`;

  return {
    message_id: messageId,
    conversation_id: conversationId,
    contact_id: knownRoute?.contactId || null,
    location_id: knownRoute?.locationId || null,
    notification_type: notificationType,
    severity: knownRoute ? "normal" : "attention",
    title: params.complianceKeyword
      ? `${params.complianceKeyword.toUpperCase()} received by CRM SMS`
      : knownRoute
        ? `New SMS from ${knownRoute.contactName}`
        : `Unmatched SMS from ${params.from}`,
    body: params.body,
    action_href: actionHref,
    routing_status: knownRoute ? "matched" : "unmatched",
    metadata: {
      from: params.from,
      to: params.to,
      telnyx_event_id: params.eventId,
      contact_name: knownRoute?.contactName || null,
    },
  };
}

async function repairDuplicate(params: RouteInboundParams, knownRoute: ContactRoute | null, conversationId: string) {
  const { data: existing, error } = await supabaseAdmin
    .from("crm_messages")
    .select("id,created_at")
    .eq("source_system", "telnyx_webhook")
    .eq("source_record_id", `telnyx-event:${params.eventId}`)
    .maybeSingle();

  if (error) throw error;
  if (!existing?.id) throw new Error("Duplicate CRM SMS event could not be recovered");

  const now = new Date().toISOString();
  await Promise.all([
    supabaseAdmin
      .from("crm_conversations")
      .update({
        status: "waiting_on_team",
        last_message_at: existing.created_at || now,
        last_inbound_at: existing.created_at || now,
        is_unread: true,
        updated_at: now,
      })
      .eq("id", conversationId),
    supabaseAdmin
      .from("crm_message_notifications")
      .upsert(notificationValues(params, knownRoute, conversationId, existing.id), { onConflict: "message_id" }),
  ]);

  return {
    conversationId,
    locationId: knownRoute?.locationId || null,
    contactId: knownRoute?.contactId || null,
    matched: Boolean(knownRoute),
    messageId: existing.id,
    duplicate: true,
  };
}

export async function routeInboundCrmSms(params: RouteInboundParams) {
  if (params.to !== CRM_MAIN_NUMBER) return null;

  const knownRoute = await findKnownContactRoute(params.from);
  const conversationId = knownRoute
    ? await getOrCreateMatchedConversation(params.from, knownRoute)
    : await getOrCreateUnmatchedConversation(params.from);

  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from("crm_conversations")
    .select("id,location_id,unread_count")
    .eq("id", conversationId)
    .single();

  if (conversationError) throw conversationError;

  const now = new Date().toISOString();
  const { data: inbound, error: inboundError } = await supabaseAdmin
    .from("crm_messages")
    .insert({
      conversation_id: conversationId,
      direction: "inbound",
      channel: "sms",
      message_type: params.complianceKeyword ? "compliance" : "message",
      body_text: params.body,
      provider: "telnyx",
      provider_message_id: params.providerMessageId,
      status: "received",
      replied_at: now,
      source_system: "telnyx_webhook",
      source_record_id: `telnyx-event:${params.eventId}`,
      metadata: {
        telnyx_event_id: params.eventId,
        from: params.from,
        to: params.to,
        routing_status: knownRoute ? "matched" : "unmatched",
        contact_id: knownRoute?.contactId || null,
        account_id: knownRoute?.accountId || null,
        compliance_keyword: params.complianceKeyword || null,
      },
    })
    .select("id")
    .single();

  if (inboundError) {
    if (inboundError.code === "23505") {
      return repairDuplicate(params, knownRoute, conversationId);
    }
    throw inboundError;
  }

  await Promise.all([
    supabaseAdmin
      .from("crm_conversations")
      .update({
        status: "waiting_on_team",
        last_message_at: now,
        last_inbound_at: now,
        is_unread: true,
        unread_count: Number(conversation.unread_count || 0) + 1,
        updated_at: now,
        metadata: knownRoute
          ? {
              routing_status: "matched",
              contact_id: knownRoute.contactId,
              account_id: knownRoute.accountId,
              inbound_phone: params.from,
              telnyx_to: params.to,
            }
          : {
              routing_status: "unmatched",
              inbound_phone: params.from,
              telnyx_to: params.to,
            },
      })
      .eq("id", conversationId),
    supabaseAdmin
      .from("crm_message_notifications")
      .upsert(notificationValues(params, knownRoute, conversationId, inbound.id), { onConflict: "message_id" }),
    knownRoute
      ? supabaseAdmin.from("crm_activities").insert({
          account_id: knownRoute.accountId,
          location_id: knownRoute.locationId,
          contact_id: knownRoute.contactId,
          activity_type: "sms",
          direction: "inbound",
          channel: "sms",
          summary: params.complianceKeyword
            ? `CRM SMS compliance keyword ${params.complianceKeyword.toUpperCase()} received`
            : `SMS reply received on ${CRM_MAIN_NUMBER}`,
          body: params.body,
          occurred_at: now,
          source_system: "telnyx_webhook",
          source_table: "crm_messages",
          source_record_id: inbound.id,
          visibility: "internal",
          is_system_generated: true,
          metadata: { from: params.from, to: params.to, providerMessageId: params.providerMessageId },
        })
      : Promise.resolve(),
  ]);

  return {
    conversationId,
    locationId: knownRoute?.locationId || null,
    contactId: knownRoute?.contactId || null,
    matched: Boolean(knownRoute),
    messageId: inbound.id,
  };
}
