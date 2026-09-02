from datetime import datetime, timezone

import base_core as core

VALID_SCOPES = {"crm", "reservations", "support"}
WAITING_STATUSES = {"waiting_on_rep", "waiting_on_team", "open", "new"}
CRM_ACTIVITY_TYPES = ("call", "phone_call", "claim_invitation", "follow_up", "social_outreach", "site_visit")


def text(value):
    return str(value or "").strip()


def label(value):
    return text(value).replace("_", " ").title()


def metadata_value(metadata, key):
    if not isinstance(metadata, dict):
        return None
    value = metadata.get(key)
    return text(value) or None


def routing_status(metadata):
    return metadata_value(metadata, "routing_status")


def inbound_phone(metadata):
    return metadata_value(metadata, "inbound_phone") or metadata_value(metadata, "phone")


def conversation_scope(row):
    assigned_team = text(row.get("assigned_team")).lower()
    context_type = text(metadata_value(row.get("metadata"), "context_type")).lower()
    key = text(row.get("conversation_key")).lower()

    if row.get("reservation_id") or assigned_team == "reservations" or context_type == "reservation" or key.startswith("reservation:"):
        return "reservations"
    if (
        assigned_team in {"support", "experience", "experience_team", "customer_support"}
        or context_type in {"support", "ticket", "support_ticket"}
        or key.startswith("support:")
        or key.startswith("ticket:")
    ):
        return "support"
    return "crm"


def timestamp_key(value):
    if not value:
        return 0.0
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()
    except (TypeError, ValueError):
        return 0.0


def read_communication_center(payload):
    scope = text(payload.get("scope") or "crm").lower()
    if scope not in VALID_SCOPES:
        scope = "crm"

    conversations, _ = core.supabase_rows(
        "crm_conversations",
        "id,conversation_key,location_id,reservation_id,assigned_team,channel,subject,status,is_unread,unread_count,last_message_at,metadata",
        [("archived_at", "is.null"), ("order", "last_message_at.desc.nullslast")],
        limit=250,
    )
    scoped = [row for row in conversations if conversation_scope(row) == scope]
    conversation_ids = [text(row.get("id")) for row in scoped if text(row.get("id"))]
    conversation_map = {text(row.get("id")): row for row in scoped if text(row.get("id"))}

    messages = []
    if conversation_ids:
        messages, _ = core.supabase_rows(
            "crm_messages",
            "id,conversation_id,direction,channel,subject,body_text,status,source_system,sent_at,delivered_at,created_at",
            [
                ("conversation_id", f"in.({','.join(conversation_ids)})"),
                ("archived_at", "is.null"),
                ("order", "created_at.desc"),
            ],
            limit=100,
        )

    activities = []
    if scope == "crm":
        activities, _ = core.supabase_rows(
            "crm_activities",
            "id,location_id,activity_type,direction,channel,summary,body,occurred_at,created_at",
            [
                ("activity_type", f"in.({','.join(CRM_ACTIVITY_TYPES)})"),
                ("order", "occurred_at.desc"),
            ],
            limit=20,
        )

    location_ids = []
    seen_locations = set()
    for row in messages:
        conversation = conversation_map.get(text(row.get("conversation_id"))) or {}
        location_id = text(conversation.get("location_id"))
        if location_id and location_id not in seen_locations:
            seen_locations.add(location_id)
            location_ids.append(location_id)
    for row in activities:
        location_id = text(row.get("location_id"))
        if location_id and location_id not in seen_locations:
            seen_locations.add(location_id)
            location_ids.append(location_id)

    location_map = {}
    if location_ids:
        locations, _ = core.supabase_rows(
            "locations",
            "id,name",
            [("id", f"in.({','.join(location_ids)})")],
            limit=len(location_ids),
        )
        location_map = {text(row.get("id")): text(row.get("name")) or "Location" for row in locations}

    feed = []
    sms_conversation_ids = set()

    for row in messages:
        conversation_id = text(row.get("conversation_id"))
        conversation = conversation_map.get(conversation_id)
        if not conversation:
            continue
        location_id = text(conversation.get("location_id")) or None
        channel = text(row.get("channel") or conversation.get("channel") or "message").lower()
        direction = text(row.get("direction")).lower() or None
        timestamp = text(row.get("delivered_at") or row.get("sent_at") or row.get("created_at"))

        if channel == "sms" and conversation_id:
            if conversation_id in sms_conversation_ids:
                continue
            sms_conversation_ids.add(conversation_id)
            phone = inbound_phone(conversation.get("metadata"))
            unmatched_sms = routing_status(conversation.get("metadata")) == "unmatched"
            if scope == "reservations":
                href = "/admin/dashboard/reservations"
            elif scope == "support":
                href = "/admin/dashboard/support"
            elif unmatched_sms or not location_id:
                href = f"/admin/dashboard/crm/communications/unmatched?conversation={conversation_id}"
            else:
                href = f"/admin/dashboard/crm/{location_id}?tab=communication&commTab=inbox"
            feed.append({
                "id": f"conversation:{conversation_id}",
                "locationId": location_id,
                "locationName": location_map.get(location_id) if location_id else None,
                "channel": "sms",
                "direction": direction,
                "title": f"Text conversation · {phone}" if phone else text(conversation.get("subject")) or "Text conversation",
                "preview": text(row.get("body_text"))[:180],
                "status": text(conversation.get("status") or row.get("status")) or None,
                "unread": bool(conversation.get("is_unread")),
                "timestamp": text(conversation.get("last_message_at")) or timestamp,
                "href": href,
            })
            continue

        title = text(row.get("subject")) or text(conversation.get("subject")) or f"{'Received' if direction == 'inbound' else 'Sent'} {label(channel)}"
        if scope == "reservations":
            href = "/admin/dashboard/reservations"
        elif scope == "support":
            href = "/admin/dashboard/support"
        elif location_id:
            href = f"/admin/dashboard/crm/{location_id}?tab=communication&commTab=inbox"
        else:
            href = "/admin/dashboard/crm/notifications"
        feed.append({
            "id": f"message:{text(row.get('id'))}",
            "locationId": location_id,
            "locationName": location_map.get(location_id) if location_id else None,
            "channel": channel,
            "direction": direction,
            "title": title,
            "preview": text(row.get("body_text"))[:180],
            "status": text(row.get("status") or conversation.get("status")) or None,
            "unread": bool(conversation.get("is_unread") and direction == "inbound"),
            "timestamp": timestamp,
            "href": href,
        })

    for row in activities:
        location_id = text(row.get("location_id")) or None
        activity_type = text(row.get("activity_type")) or "activity"
        feed.append({
            "id": f"activity:{text(row.get('id'))}",
            "locationId": location_id,
            "locationName": location_map.get(location_id) if location_id else None,
            "channel": text(row.get("channel") or activity_type),
            "direction": text(row.get("direction")) or None,
            "title": text(row.get("summary")) or label(activity_type),
            "preview": text(row.get("body"))[:180],
            "status": None,
            "unread": False,
            "timestamp": text(row.get("occurred_at") or row.get("created_at")),
            "href": f"/admin/dashboard/crm/{location_id}?tab=communication" if location_id else "/admin/dashboard/crm/notifications",
        })

    feed.sort(key=lambda item: timestamp_key(item.get("timestamp")), reverse=True)
    unread_count = sum(1 for row in scoped if bool(row.get("is_unread")))
    waiting_count = sum(
        1
        for row in scoped
        if text(row.get("status")).lower() in WAITING_STATUSES or bool(row.get("is_unread"))
    )
    return {
        "scope": scope,
        "items": feed[:30],
        "unreadCount": unread_count,
        "waitingCount": waiting_count,
    }
