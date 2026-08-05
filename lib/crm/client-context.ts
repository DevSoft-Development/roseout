export type ClientCrmContext = {
  accountId?: string;
  contactId?: string;
  locationId?: string;
  opportunityId?: string;
  returnTo?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseClientCrmContext(params: URLSearchParams): ClientCrmContext {
  const read = (...keys: string[]) => {
    for (const key of keys) {
      const value = params.get(key);
      if (value && UUID.test(value)) return value;
    }
    return undefined;
  };

  return {
    accountId: read("account_id", "accountId", "account"),
    contactId: read("contact_id", "contactId"),
    locationId: read("location_id", "locationId", "location", "selectedLocation", "business_id"),
    opportunityId: read("opportunity_id", "opportunityId"),
    returnTo: safeClientCrmReturnTo(params.get("return_to")),
  };
}

export function safeClientCrmReturnTo(value?: string | null) {
  if (!value) return undefined;
  try {
    const decoded = decodeURIComponent(value);
    if (
      decoded.startsWith("/admin/dashboard/crm") &&
      !decoded.startsWith("//") &&
      !/^[a-z][a-z0-9+.-]*:/i.test(decoded)
    ) {
      return decoded;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function withClientCrmContext(path: string, context: ClientCrmContext) {
  const url = new URL(path, "https://crm.local");
  if (context.accountId) url.searchParams.set("account_id", context.accountId);
  if (context.contactId) url.searchParams.set("contact_id", context.contactId);
  if (context.locationId) url.searchParams.set("location_id", context.locationId);
  if (context.opportunityId) url.searchParams.set("opportunity_id", context.opportunityId);
  if (context.returnTo) url.searchParams.set("return_to", context.returnTo);
  return `${url.pathname}${url.search}`;
}

export function crmContextHiddenFields(context: ClientCrmContext) {
  return [
    ["account_id", context.accountId],
    ["contact_id", context.contactId],
    ["location_id", context.locationId],
    ["opportunity_id", context.opportunityId],
    ["return_to", context.returnTo],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
}
