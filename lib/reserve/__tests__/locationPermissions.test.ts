import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
  })),
}));

type MockUser = { id: string; email?: string | null } | null;
let currentUser: MockUser = null;

vi.mock("@/lib/supabase-server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: currentUser } })),
    },
  })),
}));

type Row = Record<string, any>;

const tables: Record<string, Row[]> = {};
const authUsers = new Map<string, { email?: string | null; role?: string | null }>();

function resetTables(seed: Record<string, Row[]> = {}) {
  for (const key of Object.keys(tables)) delete tables[key];
  Object.assign(tables, seed);
  authUsers.clear();
  currentUser = null;
}

function compareValue(actual: any, expected: any) {
  return String(actual ?? "").toLowerCase() === String(expected ?? "").toLowerCase();
}

class MockQuery {
  private filters: Array<(row: Row) => boolean> = [];
  private limitCount: number | null = null;

  constructor(private readonly table: string) {}

  select() {
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  ilike(column: string, value: any) {
    this.filters.push((row) => compareValue(row[column], value));
    return this;
  }

  is(column: string, value: any) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: any[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  or(expression: string) {
    const clauses = expression.split(",").map((clause) => {
      const [column, op, ...rest] = clause.split(".");
      const value = rest.join(".");
      return { column, op, value };
    });
    this.filters.push((row) =>
      clauses.some(({ column, op, value }) => {
        if (op === "eq") return compareValue(row[column], value);
        return false;
      }),
    );
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    return Promise.resolve({ data: this.rows()[0] ?? null, error: null });
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: this.rows(), error: null }).then(onfulfilled, onrejected);
  }

  private rows() {
    let rows = [...(tables[this.table] ?? [])];
    for (const filter of this.filters) rows = rows.filter(filter);
    if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
    return rows;
  }
}

const fromMock = vi.fn((table: string) => new MockQuery(table));

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: fromMock,
    auth: {
      admin: {
        getUserById: vi.fn(async (userId: string) => {
          const user = authUsers.get(userId);
          return {
            data: {
              user: user
                ? {
                    email: user.email ?? null,
                    app_metadata: { role: user.role ?? null },
                    user_metadata: {},
                  }
                : null,
            },
          };
        }),
      },
    },
  },
}));

function location(overrides: Row = {}) {
  return {
    id: "loc-1",
    source_id: "source-1",
    source_table: "restaurants",
    name: "Demo Location",
    ...overrides,
  };
}

function teamMember(overrides: Row = {}) {
  return {
    location_id: "loc-1",
    user_id: "team-1",
    email: "team@example.com",
    role: "view_only",
    permissions: null,
    invitation_status: "accepted",
    ...overrides,
  };
}

async function getReserveModule() {
  return import("@/lib/reserve/locationPermissions");
}

beforeEach(() => {
  vi.clearAllMocks();
  resetTables();
});

describe("Reserve location permissions", () => {
  it("gives an admin full Reserve access", async () => {
    resetTables({
      admin_users: [{ user_id: "admin-1", email: "admin@example.com", role: "admin" }],
      locations: [location()],
    });
    authUsers.set("admin-1", { email: "admin@example.com" });

    const { getReserveLocationAccess } = await getReserveModule();
    const access = await getReserveLocationAccess({ id: "admin-1", email: "admin@example.com" }, "loc-1");

    expect(access.allowed).toBe(true);
    expect(access.role).toBe("location_admin");
    expect(access.isAdmin).toBe(true);
    expect(access.permissions.manageReservations).toBe(true);
    expect(access.permissions.manageTeam).toBe(true);
  });

  it("gives an approved owner full Reserve access", async () => {
    resetTables({
      locations: [location()],
      business_claims: [{ user_id: "owner-1", location_id: "loc-1", status: "approved" }],
    });
    authUsers.set("owner-1", { email: "owner@example.com" });

    const { getReserveLocationAccess } = await getReserveModule();
    const access = await getReserveLocationAccess({ id: "owner-1", email: "owner@example.com" }, "loc-1");

    expect(access.allowed).toBe(true);
    expect(access.role).toBe("location_admin");
    expect(access.permissions.manageLayout).toBe(true);
    expect(access.permissions.manageBilling).toBe(true);
  });

  it("gives a location admin full Reserve access", async () => {
    resetTables({
      locations: [location()],
      location_team_members: [
        teamMember({
          user_id: "team-admin-1",
          email: "team-admin@example.com",
          role: "location_admin",
        }),
      ],
    });
    authUsers.set("team-admin-1", { email: "team-admin@example.com" });

    const { getReserveLocationAccess } = await getReserveModule();
    const access = await getReserveLocationAccess({ id: "team-admin-1", email: "team-admin@example.com" }, "loc-1");

    expect(access.allowed).toBe(true);
    expect(access.role).toBe("location_admin");
    expect(access.permissions.manageReservations).toBe(true);
    expect(access.permissions.manageQrCodes).toBe(true);
    expect(access.permissions.manageTeam).toBe(true);
  });

  it("gives a manager reservations, layout, hours, reminders, and QR access but not billing or team management", async () => {
    resetTables({
      locations: [location()],
      location_team_members: [
        teamMember({
          user_id: "manager-1",
          email: "manager@example.com",
          role: "manager",
        }),
      ],
    });
    authUsers.set("manager-1", { email: "manager@example.com" });

    const { getReserveLocationAccess } = await getReserveModule();
    const access = await getReserveLocationAccess({ id: "manager-1", email: "manager@example.com" }, "loc-1");

    expect(access.allowed).toBe(true);
    expect(access.role).toBe("manager");
    expect(access.permissions.manageReservations).toBe(true);
    expect(access.permissions.manageLayout).toBe(true);
    expect(access.permissions.manageHours).toBe(true);
    expect(access.permissions.manageReminders).toBe(true);
    expect(access.permissions.manageQrCodes).toBe(true);
    expect(access.permissions.manageBilling).toBe(false);
    expect(access.permissions.manageTeam).toBe(false);
  });

  it("gives a host reservation access only", async () => {
    resetTables({
      locations: [location()],
      location_team_members: [
        teamMember({
          user_id: "host-1",
          email: "host@example.com",
          role: "host",
        }),
      ],
    });
    authUsers.set("host-1", { email: "host@example.com" });

    const { getReserveLocationAccess } = await getReserveModule();
    const access = await getReserveLocationAccess({ id: "host-1", email: "host@example.com" }, "loc-1");

    expect(access.allowed).toBe(true);
    expect(access.role).toBe("host");
    expect(access.permissions.manageReservations).toBe(true);
    expect(access.permissions.manageLayout).toBe(false);
    expect(access.permissions.manageQrCodes).toBe(false);
    expect(access.permissions.manageTeam).toBe(false);
  });

  it("gives a marketing role QR, profile, and analytics access", async () => {
    resetTables({
      locations: [location()],
      location_team_members: [
        teamMember({
          user_id: "marketing-1",
          email: "marketing@example.com",
          role: "marketing",
        }),
      ],
    });
    authUsers.set("marketing-1", { email: "marketing@example.com" });

    const { getReserveLocationAccess } = await getReserveModule();
    const access = await getReserveLocationAccess({ id: "marketing-1", email: "marketing@example.com" }, "loc-1");

    expect(access.allowed).toBe(true);
    expect(access.role).toBe("marketing");
    expect(access.permissions.viewAnalytics).toBe(true);
    expect(access.permissions.manageQrCodes).toBe(true);
    expect(access.permissions.editProfile).toBe(true);
    expect(access.permissions.manageReservations).toBe(false);
    expect(access.permissions.manageTeam).toBe(false);
  });

  it("keeps view-only users read-only", async () => {
    resetTables({
      locations: [location()],
      location_team_members: [
        teamMember({
          user_id: "viewer-1",
          email: "viewer@example.com",
          role: "view_only",
          permissions: { manageReservations: true, manageTeam: true },
        }),
      ],
    });
    authUsers.set("viewer-1", { email: "viewer@example.com" });

    const { getReserveLocationAccess } = await getReserveModule();
    const access = await getReserveLocationAccess({ id: "viewer-1", email: "viewer@example.com" }, "loc-1");

    expect(access.allowed).toBe(true);
    expect(access.role).toBe("view_only");
    expect(access.permissions.viewDashboard).toBe(true);
    expect(access.permissions.viewAnalytics).toBe(true);
    expect(access.permissions.manageReservations).toBe(false);
    expect(access.permissions.manageTeam).toBe(false);
  });

  it("returns 401 from requireReservePermission for unauthenticated users", async () => {
    resetTables({ locations: [location()] });
    currentUser = null;

    const { requireReservePermission } = await getReserveModule();
    const result = await requireReservePermission("loc-1", "viewDashboard");

    expect(result.error).toBeInstanceOf(Response);
    expect(result.error.status).toBe(401);
    await expect(result.error.json()).resolves.toMatchObject({
      success: false,
      error: "Please sign in to continue.",
    });
  });

  it("returns 403 from requireReservePermission for denied users", async () => {
    resetTables({ locations: [location()] });
    currentUser = { id: "denied-1", email: "denied@example.com" };
    authUsers.set("denied-1", { email: "denied@example.com" });

    const { requireReservePermission } = await getReserveModule();
    const result = await requireReservePermission("loc-1", "viewDashboard");

    expect(result.error).toBeInstanceOf(Response);
    expect(result.error.status).toBe(403);
    await expect(result.error.json()).resolves.toMatchObject({
      success: false,
      error: "You do not have permission to manage this location.",
    });
  });

  it("resolves Reserve access through a canonical source_id", async () => {
    resetTables({
      locations: [location()],
      business_claims: [{ user_id: "owner-1", location_id: "loc-1", status: "approved" }],
    });
    authUsers.set("owner-1", { email: "owner@example.com" });

    const { getReserveLocationAccess } = await getReserveModule();
    const access = await getReserveLocationAccess({ id: "owner-1", email: "owner@example.com" }, "source-1");

    expect(access.allowed).toBe(true);
    expect(access.location?.id).toBe("loc-1");
    expect(access.permissions.manageReservations).toBe(true);
  });
});
