import re

import base_core as core

US_E164_RE = re.compile(r"^\+1\d{10}$")


def normalize_phone(value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    if raw.startswith("+"):
        return "+" + re.sub(r"\D", "", raw[1:])
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 10:
        return "+1" + digits
    if len(digits) == 11 and digits.startswith("1"):
        return "+" + digits
    return raw


def unique_values(rows, key):
    values = []
    seen = set()
    for row in rows:
        value = core.text(row.get(key))
        if value and value not in seen:
            seen.add(value)
            values.append(value)
    return values


def read_crm_sms_recipients(payload):
    location_id = core.text(payload.get("locationId"))
    if not location_id:
        raise ValueError("locationId_required")

    account_links, _ = core.supabase_rows(
        "crm_account_locations",
        "account_id",
        [
            ("location_id", f"eq.{location_id}"),
            ("status", "eq.active"),
        ],
    )
    account_ids = unique_values(account_links, "account_id")
    if not account_ids:
        return {"recipients": []}

    relationships, _ = core.supabase_rows(
        "crm_account_contacts",
        "contact_id,relationship_type,role_label,is_primary,account_id",
        [
            ("account_id", f"in.({','.join(account_ids)})"),
            ("is_active", "eq.true"),
        ],
    )
    contact_ids = unique_values(relationships, "contact_id")
    if not contact_ids:
        return {"recipients": []}

    contacts, _ = core.supabase_rows(
        "crm_contacts",
        "id,full_name,first_name,last_name,phone,job_title,department,contact_type,"
        "is_primary,is_decision_maker,sms_consent_status,do_not_contact",
        [
            ("id", f"in.({','.join(contact_ids)})"),
            ("archived_at", "is.null"),
        ],
    )

    relationship_by_contact = {}
    for row in relationships:
        contact_id = core.text(row.get("contact_id"))
        if contact_id:
            relationship_by_contact[contact_id] = row

    recipients = []
    for contact in contacts:
        phone = normalize_phone(contact.get("phone"))
        if not phone or US_E164_RE.fullmatch(phone) is None:
            continue

        contact_id = core.text(contact.get("id"))
        relationship = relationship_by_contact.get(contact_id, {})
        full_name = core.text(contact.get("full_name"))
        if full_name:
            name = full_name
        else:
            name = " ".join(
                value for value in [core.text(contact.get("first_name")), core.text(contact.get("last_name"))]
                if value
            ) or "CRM contact"

        role = (
            core.text(relationship.get("role_label"))
            or core.text(contact.get("job_title"))
            or core.text(contact.get("contact_type"))
            or core.text(relationship.get("relationship_type"))
            or "Contact"
        )
        recipients.append({
            "contactId": contact_id,
            "name": name,
            "role": role,
            "phone": phone,
            "isPrimary": bool(relationship.get("is_primary") or contact.get("is_primary")),
            "isDecisionMaker": bool(contact.get("is_decision_maker")),
            "smsConsentStatus": core.text(contact.get("sms_consent_status")) or "unknown",
            "doNotContact": bool(contact.get("do_not_contact")),
        })

    recipients.sort(key=lambda item: (
        -int(item["isPrimary"]),
        -int(item["isDecisionMaker"]),
        item["name"].casefold(),
    ))
    return {"recipients": recipients}
