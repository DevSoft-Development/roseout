export const COMMUNICATION_CHILD_TABS = ["overview","inbox","email","sms","notifications","templates","contacts","approvals","delivery","settings"] as const;
export type CommunicationChildTab = (typeof COMMUNICATION_CHILD_TABS)[number];

export type CommunicationRecord = {
  id?: string;
  channel?: string | null;
  subject?: string | null;
  body?: string | null;
  message?: string | null;
  to_address?: string | null;
  recipient?: string | null;
  recipient_name?: string | null;
  contact_name?: string | null;
  direction?: string | null;
  status?: string | null;
  delivery_status?: string | null;
  created_at?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  opened_at?: string | null;
  clicked_at?: string | null;
  failure_reason?: string | null;
  consent_status?: string | null;
  related_type?: string | null;
  related_id?: string | null;
  assigned_to?: string | null;
  read_at?: string | null;
  priority?: string | null;
  internal?: boolean | null;
};

export function normalizeCommunicationChildTab(primaryTab?: string | null, childTab?: string | null): CommunicationChildTab {
  const raw = (childTab || primaryTab || "overview").toLowerCase().trim().replace(/_/g, "-");
  const aliases: Record<string, CommunicationChildTab> = {
    communication: "overview",
    communications: "overview",
    messaging: "inbox",
    messages: "inbox",
    conversation: "inbox",
    conversations: "inbox",
    notification: "notifications",
    preferences: "settings",
    "communication-settings": "settings",
    configuration: "settings",
  };
  const candidate = aliases[raw] || raw;
  return COMMUNICATION_CHILD_TABS.includes(candidate as CommunicationChildTab) ? (candidate as CommunicationChildTab) : "overview";
}

export function normalizeInboxRecord(record: CommunicationRecord, index = 0) {
  const channel = (record.channel || "email").toLowerCase();
  const status = (record.status || record.delivery_status || "pending").toLowerCase();
  const contact = record.contact_name || record.recipient_name || record.recipient || record.to_address || "Unknown contact";
  return {
    id: record.id || `communication-${index}`,
    contactName: contact,
    contactType: record.related_type || "Location contact",
    preview: record.subject || record.body || record.message || "No message preview available",
    channel,
    direction: record.direction || "outbound",
    status,
    unread: !record.read_at && record.direction === "inbound",
    priority: record.priority || (status === "failed" ? "High" : "Normal"),
    assignedTo: record.assigned_to || "Unassigned",
    relatedRecord: [record.related_type, record.related_id].filter(Boolean).join(" ") || "Location CRM",
    lastMessageTime: record.sent_at || record.created_at || null,
    responseDueTime: null as string | null,
    consentStatus: record.consent_status || "not tracked",
    deliveryStatus: record.delivery_status || record.status || "pending",
    internal: Boolean(record.internal),
  };
}

export function orderConversation(records: CommunicationRecord[]) {
  return [...records].sort((a, b) => new Date(a.created_at || a.sent_at || 0).getTime() - new Date(b.created_at || b.sent_at || 0).getTime());
}

export function canRetryDelivery(record: CommunicationRecord) {
  const status = String(record.status || record.delivery_status || "").toLowerCase();
  const reason = String(record.failure_reason || "").toLowerCase();
  const permanent = ["invalid email", "invalid phone", "opted out", "missing consent", "unresolved variable", "suppressed"].some((item) => reason.includes(item));
  return status === "failed" && !permanent;
}

export function hasUnresolvedTemplateVariables(text: string) {
  return /{{\s*[^}]+\s*}}/.test(text);
}

export function classifySms(messageType: string) {
  return /promo|marketing|offer|campaign|vip/i.test(messageType) ? "promotional" : "transactional";
}
