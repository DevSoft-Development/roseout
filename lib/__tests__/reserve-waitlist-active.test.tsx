import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
const sendReservationSmsMock = vi.fn();

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: fromMock },
}));

vi.mock("@/lib/supabase-server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: vi.fn(async () => ({ data: { user: null } })) } })),
}));

vi.mock("@/lib/admin-api-auth", () => ({
  requireAdminApiRole: vi.fn(async () => ({ adminUser: { id: "admin-1" } })),
}));

vi.mock("@/lib/admin/admin-access", () => ({
  requireAdminLocationApiRead: vi.fn(async () => ({ adminUser: { id: "admin-1" } })),
  requireAdminLocationApiWrite: vi.fn(async () => ({ adminUser: { id: "admin-1" } })),
}));

vi.mock("@/lib/admin/audit-log", () => ({
  logAdminLocationAction: vi.fn(async () => undefined),
}));

vi.mock("@/lib/reservationOperations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reservationOperations")>();
  return {
    ...actual,
    logStaffActivity: vi.fn(async () => undefined),
    sendReservationSms: sendReservationSmsMock,
  };
});

function waitlistSelectQuery(rows: any[]) {
  const query: any = {
    filters: [] as any[],
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: any) => {
      query.filters.push({ type: "eq", column, value });
      return query;
    }),
    in: vi.fn((column: string, values: any[]) => {
      query.filters.push({ type: "in", column, values });
      return query;
    }),
    order: vi.fn(() => query),
    limit: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  return query;
}

function waitlistUpdateQuery(row: any) {
  const query: any = {
    patch: null as any,
    update: vi.fn((patch: any) => {
      query.patch = patch;
      return query;
    }),
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve({ data: { ...row, ...query.patch }, error: null })),
  };
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Reserve waitlist API active rows", () => {
  it("GET returns waiting and notified rows, excludes terminal statuses through the active status filter, and normalizes contact fields", async () => {
    const query = waitlistSelectQuery([
      { id: "wait-1", status: "waiting", contact_name: "New Guest", contact_phone: "+15550001", contact_email: "new@example.com" },
      { id: "wait-2", status: "notified", customer_name: "Legacy Guest", customer_phone: "+15550002", customer_email: "legacy@example.com" },
    ]);
    fromMock.mockReturnValueOnce(query);

    const { GET } = await import("@/app/api/reservations/waitlist/route");
    const response = await GET(new Request("https://app.test/api/reservations/waitlist?locationId=loc-1&date=2026-07-06") as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("location_id", "loc-1");
    expect(query.eq).toHaveBeenCalledWith("reservation_date", "2026-07-06");
    expect(query.in).toHaveBeenCalledWith("status", ["waiting", "waitlisted", "notified"]);
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(query.in.mock.calls[0][1]).not.toEqual(expect.arrayContaining(["expired", "cancelled", "booked", "seated", "converted"]));
    expect(body.waitlist).toEqual([
      expect.objectContaining({ id: "wait-1", customer_name: "New Guest", customer_phone: "+15550001", customer_email: "new@example.com" }),
      expect.objectContaining({ id: "wait-2", contact_name: "Legacy Guest", contact_phone: "+15550002", contact_email: "legacy@example.com" }),
    ]);
  });
});

describe("Reserve waitlist offer notifications", () => {
  it("notify_waitlist returns a normalized booked row and sends SMS to contact_phone before legacy customer_phone", async () => {
    const waitlistRow = {
      id: "wait-1",
      location_id: "loc-1",
      status: "waiting",
      contact_name: "Contact Guest",
      contact_phone: "+15551111",
      customer_phone: "+15552222",
    };
    const query = tableQuery({ data: waitlistRow });
    const insertReservation = tableQuery({ data: { id: "res-sms", status: "checked_in", customer_name: "Contact Guest" } });
    const updateWaitlist = tableQuery({ data: { ...waitlistRow, status: "booked", converted_reservation_id: "res-sms" } });
    fromMock.mockReturnValueOnce(query).mockReturnValueOnce(insertReservation).mockReturnValueOnce(updateWaitlist);

    const { PATCH } = await import("@/app/api/reserve/portal/layout/route");
    const response = await PATCH(new Request("https://app.test/api/reserve/portal/layout", {
      method: "PATCH",
      body: JSON.stringify({ action: "notify_waitlist", waitlist_id: "wait-1" }),
    }) as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(updateWaitlist.update).toHaveBeenCalledWith(expect.objectContaining({ status: "booked", converted_reservation_id: "res-sms" }));
    expect(sendReservationSmsMock).toHaveBeenCalledWith(expect.objectContaining({
      locationId: "loc-1",
      to: "+15551111",
      messageType: "waitlist_ready",
    }));
    expect(body.waitlist).toEqual(expect.objectContaining({
      id: "wait-1",
      status: "booked",
      customer_name: "Contact Guest",
      contact_phone: "+15551111",
      customer_phone: "+15552222",
    }));
  });
});

describe("ReserveWaitlistPanel", () => {
  it("renders a notified row as Offered and keeps it visible", async () => {
    const { default: ReserveWaitlistPanel } = await import("@/components/reserve/ReserveWaitlistPanel");
    const html = renderToStaticMarkup(
      <ReserveWaitlistPanel
        entries={[{ id: "wait-1", status: "notified", contact_name: "Offered Guest", party_size: 2, reservation_time: "19:00" }]}
        onOffer={() => undefined}
      />,
    );

    expect(html).toContain("Offered Guest");
    expect(html).toContain("Move to Timeline");
    expect(html).not.toContain("No guests waiting right now");
  });
});

function tableQuery(result: any = {}) {
  const query: any = {
    table: "",
    payload: null as any,
    select: vi.fn(() => query),
    insert: vi.fn((payload: any) => {
      query.payload = payload;
      return query;
    }),
    update: vi.fn((payload: any) => {
      query.payload = payload;
      return query;
    }),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve({ data: result.data ?? null, error: result.error ?? null })),
    single: vi.fn(() => Promise.resolve({ data: result.data, error: result.error ?? null })),
  };
  return query;
}

describe("Reserve waitlist conversion", () => {
  it("notify_waitlist creates a checked-in reservation and returns it", async () => {
    const waitlistRow = {
      id: "wait-create",
      location_id: "loc-1",
      contact_name: "Ready Guest",
      contact_phone: "+15550000",
      reservation_date: "2026-07-06",
      reservation_time: "18:30:00",
      party_size: 4,
      notes: "Window seat",
    };
    const reservationRow = { ...waitlistRow, id: "res-1", customer_name: "Ready Guest", status: "checked_in", source: "waitlist" };
    const selectWaitlist = tableQuery({ data: waitlistRow });
    const insertReservation = tableQuery({ data: reservationRow });
    const updateWaitlist = tableQuery({ data: { ...waitlistRow, status: "booked", converted_reservation_id: "res-1", converted_at: "2026-07-06T12:00:00.000Z" } });
    fromMock
      .mockReturnValueOnce(selectWaitlist)
      .mockReturnValueOnce(insertReservation)
      .mockReturnValueOnce(updateWaitlist);

    const { PATCH } = await import("@/app/api/reserve/portal/layout/route");
    const response = await PATCH(new Request("https://app.test/api/reserve/portal/layout", {
      method: "PATCH",
      body: JSON.stringify({ action: "notify_waitlist", waitlist_id: "wait-create", type: "restaurant" }),
    }) as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(insertReservation.insert).toHaveBeenCalledWith(expect.objectContaining({
      location_id: "loc-1",
      customer_name: "Ready Guest",
      customer_phone: "+15550000",
      party_size: 4,
      reservation_date: "2026-07-06",
      reservation_time: "18:30",
      status: "checked_in",
      source: "waitlist",
      special_request: "Window seat",
      special_requests: "Window seat",
    }));
    expect(body.reservation).toEqual(expect.objectContaining({ id: "res-1", status: "checked_in" }));
  });

  it("notify_waitlist marks the waitlist row booked with conversion metadata", async () => {
    const waitlistRow = { id: "wait-book", location_id: "loc-1", contact_name: "Booked Guest" };
    const reservationRow = { id: "res-book", customer_name: "Booked Guest", status: "checked_in" };
    const selectWaitlist = tableQuery({ data: waitlistRow });
    const insertReservation = tableQuery({ data: reservationRow });
    const updateWaitlist = tableQuery({ data: { ...waitlistRow, status: "booked", converted_reservation_id: "res-book", converted_at: "now", expires_at: null } });
    fromMock.mockReturnValueOnce(selectWaitlist).mockReturnValueOnce(insertReservation).mockReturnValueOnce(updateWaitlist);

    const { PATCH } = await import("@/app/api/reserve/portal/layout/route");
    const response = await PATCH(new Request("https://app.test/api/reserve/portal/layout", { method: "PATCH", body: JSON.stringify({ action: "notify_waitlist", waitlist_id: "wait-book" }) }) as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(updateWaitlist.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "booked",
      converted_reservation_id: "res-book",
      expires_at: null,
    }));
    expect(updateWaitlist.update.mock.calls[0][0].converted_at).toBeTruthy();
    expect(body.waitlist).toEqual(expect.objectContaining({ status: "booked", converted_reservation_id: "res-book" }));
  });

  it("notify_waitlist reuses an existing converted reservation without inserting a duplicate", async () => {
    const waitlistRow = { id: "wait-existing", location_id: "loc-1", converted_reservation_id: "res-existing", contact_name: "Existing Guest" };
    const reservationRow = { id: "res-existing", customer_name: "Existing Guest", status: "checked_in" };
    const selectWaitlist = tableQuery({ data: waitlistRow });
    const selectReservation = tableQuery({ data: reservationRow });
    const updateWaitlist = tableQuery({ data: { ...waitlistRow, status: "booked" } });
    fromMock.mockReturnValueOnce(selectWaitlist).mockReturnValueOnce(selectReservation).mockReturnValueOnce(updateWaitlist);

    const { PATCH } = await import("@/app/api/reserve/portal/layout/route");
    const response = await PATCH(new Request("https://app.test/api/reserve/portal/layout", { method: "PATCH", body: JSON.stringify({ action: "notify_waitlist", waitlist_id: "wait-existing" }) }) as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(selectReservation.maybeSingle).toHaveBeenCalled();
    expect(selectReservation.insert).not.toHaveBeenCalled();
    expect(body.reservation).toEqual(expect.objectContaining({ id: "res-existing" }));
  });
});
