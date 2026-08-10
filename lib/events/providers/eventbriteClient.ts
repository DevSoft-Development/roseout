const EVENTBRITE_API_BASE_URL = "https://www.eventbriteapi.com/v3";
const REQUEST_TIMEOUT_MS = 15_000;

type EventbritePagination = {
  object_count?: number;
  page_count?: number;
  page_number?: number;
  page_size?: number;
  has_more_items?: boolean;
};

type EventbriteUser = {
  id?: string | number;
  name?: string;
};

type EventbriteOrganization = {
  id?: string | number;
  name?: string;
};

type EventbriteOrganizationsResponse = {
  organizations?: EventbriteOrganization[];
  pagination?: EventbritePagination;
};

type EventbriteEventsResponse = {
  events?: unknown[];
  pagination?: EventbritePagination;
};

export type EventbriteConnectivityOrganization = {
  id: string;
  name: string | null;
  currentFutureEventCount: number;
};

export type EventbriteConnectivityResult = {
  configured: boolean;
  authenticated: boolean;
  userId: string | null;
  userName: string | null;
  organizationCount: number;
  organizations: EventbriteConnectivityOrganization[];
};

function eventbriteToken() {
  return process.env.EVENTBRITE_PRIVATE_TOKEN?.trim() || null;
}

async function eventbriteGet<T>(path: string, fetchImpl: typeof fetch): Promise<T> {
  const token = eventbriteToken();
  if (!token) throw new Error("EVENTBRITE_PRIVATE_TOKEN is not configured.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${EVENTBRITE_API_BASE_URL}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Eventbrite request failed with HTTP ${response.status}.`);
    }

    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

function objectCount(payload: EventbriteEventsResponse) {
  const count = Number(payload.pagination?.object_count);
  if (Number.isFinite(count) && count >= 0) return count;
  return Array.isArray(payload.events) ? payload.events.length : 0;
}

export async function checkEventbriteConnectivity(options: { fetchImpl?: typeof fetch } = {}): Promise<EventbriteConnectivityResult> {
  const fetchImpl = options.fetchImpl || fetch;
  if (!eventbriteToken()) {
    return {
      configured: false,
      authenticated: false,
      userId: null,
      userName: null,
      organizationCount: 0,
      organizations: [],
    };
  }

  const user = await eventbriteGet<EventbriteUser>("/users/me/", fetchImpl);
  const organizationsPayload = await eventbriteGet<EventbriteOrganizationsResponse>("/users/me/organizations/", fetchImpl);
  const rawOrganizations = Array.isArray(organizationsPayload.organizations)
    ? organizationsPayload.organizations
    : [];

  const organizations = await Promise.all(rawOrganizations.map(async (organization) => {
    const id = String(organization.id ?? "").trim();
    if (!id) {
      return {
        id: "unknown",
        name: organization.name?.trim() || null,
        currentFutureEventCount: 0,
      };
    }

    const payload = await eventbriteGet<EventbriteEventsResponse>(
      `/organizations/${encodeURIComponent(id)}/events/?time_filter=current_future&page_size=1`,
      fetchImpl,
    );

    return {
      id,
      name: organization.name?.trim() || null,
      currentFutureEventCount: objectCount(payload),
    };
  }));

  return {
    configured: true,
    authenticated: true,
    userId: user.id == null ? null : String(user.id),
    userName: user.name?.trim() || null,
    organizationCount: organizations.length,
    organizations,
  };
}
