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
  it("notify_waitlist updates status to notified, returns a normalized row, and sends SMS to contact_phone before legacy customer_phone", async () => {
    const query = waitlistUpdateQuery({
      id: "wait-1",
      location_id: "loc-1",
      status: "waiting",
      contact_name: "Contact Guest",
      contact_phone: "+15551111",
      customer_phone: "+15552222",
    });
    fromMock.mockReturnValueOnce(query);

    const { PATCH } = await import("@/app/api/reserve/portal/layout/route");
    const response = await PATCH(new Request("https://app.test/api/reserve/portal/layout", {
      method: "PATCH",
      body: JSON.stringify({ action: "notify_waitlist", waitlist_id: "wait-1" }),
    }) as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ status: "notified" }));
    expect(sendReservationSmsMock).toHaveBeenCalledWith(expect.objectContaining({
      locationId: "loc-1",
      to: "+15551111",
      messageType: "waitlist_ready",
    }));
    expect(body.waitlist).toEqual(expect.objectContaining({
      id: "wait-1",
      status: "notified",
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
    expect(html).toContain("Offered");
    expect(html).not.toContain("No guests waiting right now");
  });
});
