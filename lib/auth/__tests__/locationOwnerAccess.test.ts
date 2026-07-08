import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
  })),
}));

vi.mock("@/lib/supabase-server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null } })),
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

async function getAccessModule() {
  return import("@/lib/auth/locationOwnerAccess");
}

beforeEach(() => {
  vi.clearAllMocks();
  resetTables();
});

describe("location access guards", () => {
  it("allows a superadmin to view and edit a canonical location", async () => {
    resetTables({
      admin_users: [{ user_id: "admin-1", email: "admin@example.com", role: "superadmin" }],
      locations: [location()],
    });
    authUsers.set("admin-1", { email: "admin@example.com" });

    const { resolveLocationAccessContext, hasLocationPermission } = await getAccessModule();
    const access = await resolveLocationAccessContext({
      userId: "admin-1",
      userEmail: "admin@example.com",
      locationId: "loc-1",
    });

    expect(access.source).toBe("superadmin");
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(true);
    expect(access.isSuperadmin).toBe(true);
    expect(hasLocationPermission(access, "menu.edit")).toBe(true);
  });

  it("allows a viewer admin to view but not edit", async () => {
    resetTables({
      admin_users: [{ user_id: "viewer-1", email: "viewer@example.com", role: "viewer" }],
      locations: [location()],
    });
    authUsers.set("viewer-1", { email: "viewer@example.com" });

    const { resolveLocationAccessContext, hasLocationPermission } = await getAccessModule();
    const access = await resolveLocationAccessContext({
      userId: "viewer-1",
      userEmail: "viewer@example.com",
      locationId: "loc-1",
    });

    expect(access.source).toBe("admin");
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(false);
    expect(hasLocationPermission(access, "location.view")).toBe(true);
    expect(hasLocationPermission(access, "location.edit")).toBe(false);
  });

  it("allows an approved owner claim to view and edit", async () => {
    resetTables({
      locations: [location()],
      business_claims: [{ user_id: "owner-1", location_id: "loc-1", status: "approved" }],
    });
    authUsers.set("owner-1", { email: "owner@example.com" });

    const { resolveLocationAccessContext } = await getAccessModule();
    const access = await resolveLocationAccessContext({
      userId: "owner-1",
      userEmail: "owner@example.com",
      locationId: "loc-1",
    });

    expect(access.source).toBe("owner");
    expect(access.isOwner).toBe(true);
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(true);
  });

  it("allows a location team admin to edit", async () => {
    resetTables({
      locations: [location()],
      location_team_members: [
        {
          location_id: "loc-1",
          user_id: "team-admin-1",
          email: "team-admin@example.com",
          role: "location_admin",
          permissions: null,
          invitation_status: "accepted",
        },
      ],
    });
    authUsers.set("team-admin-1", { email: "team-admin@example.com" });

    const { resolveLocationAccessContext, hasLocationPermission } = await getAccessModule();
    const access = await resolveLocationAccessContext({
      userId: "team-admin-1",
      userEmail: "team-admin@example.com",
      locationId: "loc-1",
    });

    expect(access.source).toBe("location_admin");
    expect(access.isLocationAdmin).toBe(true);
    expect(access.canEdit).toBe(true);
    expect(hasLocationPermission(access, "photos.upload")).toBe(true);
  });

  it("keeps a location team view-only user from editing", async () => {
    resetTables({
      locations: [location()],
      location_team_members: [
        {
          location_id: "loc-1",
          user_id: "team-viewer-1",
          email: "team-viewer@example.com",
          role: "view_only",
          permissions: null,
          invitation_status: "active",
        },
      ],
    });
    authUsers.set("team-viewer-1", { email: "team-viewer@example.com" });

    const { resolveLocationAccessContext, hasLocationPermission } = await getAccessModule();
    const access = await resolveLocationAccessContext({
      userId: "team-viewer-1",
      userEmail: "team-viewer@example.com",
      locationId: "loc-1",
    });

    expect(access.source).toBe("view_only");
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(false);
    expect(hasLocationPermission(access, "menu.view")).toBe(true);
    expect(hasLocationPermission(access, "menu.edit")).toBe(false);
  });

  it("preserves demo center admin preview edit access when demo flags are present", async () => {
    resetTables({
      admin_users: [{ user_id: "admin-1", email: "admin@example.com", role: "admin" }],
      locations: [location({ id: "demo-loc-1" })],
    });
    authUsers.set("admin-1", { email: "admin@example.com" });

    const { resolveLocationAccessContext } = await getAccessModule();
    const access = await resolveLocationAccessContext({
      userId: "admin-1",
      userEmail: "admin@example.com",
      locationId: "demo-loc-1",
      demo: true,
      fromDemoCenter: true,
      allowDemoPreview: true,
    });

    expect(access.source).toBe("demo");
    expect(access.isDemoLocation).toBe(true);
    expect(access.isDemoPreview).toBe(true);
    expect(access.canEdit).toBe(true);
  });

  it("denies an unauthenticated user", async () => {
    resetTables({ locations: [location()] });

    const { resolveLocationAccessContext } = await getAccessModule();
    const access = await resolveLocationAccessContext({ locationId: "loc-1" });

    expect(access.source).toBe("public");
    expect(access.isAuthenticated).toBe(false);
    expect(access.canView).toBe(false);
    expect(access.canEdit).toBe(false);
  });

  it("returns a friendly missing-locationId error from requireLocationPermission", async () => {
    const { requireLocationPermission } = await getAccessModule();
    const result = await requireLocationPermission({
      userId: "admin-1",
      userEmail: "admin@example.com",
      permission: "location.view",
    });

    expect(result.error).toBeInstanceOf(Response);
    expect(result.error?.status).toBe(400);
    await expect(result.error?.json()).resolves.toMatchObject({
      success: false,
      error: "Missing locationId.",
    });
  });

  it("resolves canonical locations by source_id", async () => {
    resetTables({
      admin_users: [{ user_id: "admin-1", email: "admin@example.com", role: "admin" }],
      locations: [location()],
    });
    authUsers.set("admin-1", { email: "admin@example.com" });

    const { resolveLocationAccessContext } = await getAccessModule();
    const access = await resolveLocationAccessContext({
      userId: "admin-1",
      userEmail: "admin@example.com",
      locationId: "source-1",
    });

    expect(access.locationId).toBe("source-1");
    expect(access.canonicalLocationId).toBe("loc-1");
    expect(access.canEdit).toBe(true);
  });
});
