import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, any>;
const tables: Record<string, Row[]> = {};

class MockQuery {
  private filters: Array<(row: Row) => boolean> = [];

  constructor(private readonly table: string) {}

  select() {
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  maybeSingle() {
    const row = (tables[this.table] || []).filter((candidate) => this.filters.every((filter) => filter(candidate)))[0] || null;
    return Promise.resolve({ data: row, error: null });
  }
}

const fromMock = vi.fn((table: string) => new MockQuery(table));

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: fromMock },
}));

function reset(seed: Record<string, Row[]> = {}) {
  for (const key of Object.keys(tables)) delete tables[key];
  Object.assign(tables, seed);
  vi.clearAllMocks();
}

beforeEach(() => reset());

describe("organization access", () => {
  it("gives an owner full organization access", async () => {
    reset({
      organization_members: [
        { organization_id: "org-1", user_id: "user-1", role: "owner", status: "active" },
      ],
    });

    const { getOrganizationAccess } = await import("@/lib/organizations/access");
    const access = await getOrganizationAccess("user-1", "org-1");

    expect(access.canView).toBe(true);
    expect(access.canOperate).toBe(true);
    expect(access.canManage).toBe(true);
    expect(access.memberRole).toBe("owner");
  });

  it("lets a manager operate but not manage membership", async () => {
    reset({
      organization_members: [
        { organization_id: "org-1", user_id: "manager-1", role: "manager", status: "active" },
      ],
    });

    const { getOrganizationAccess } = await import("@/lib/organizations/access");
    const access = await getOrganizationAccess("manager-1", "org-1");

    expect(access.canView).toBe(true);
    expect(access.canOperate).toBe(true);
    expect(access.canManage).toBe(false);
  });

  it("keeps a regular member read-only in the foundation phase", async () => {
    reset({
      organization_members: [
        { organization_id: "org-1", user_id: "member-1", role: "member", status: "active" },
      ],
    });

    const { getOrganizationAccess } = await import("@/lib/organizations/access");
    const access = await getOrganizationAccess("member-1", "org-1");

    expect(access.canView).toBe(true);
    expect(access.canOperate).toBe(false);
    expect(access.canManage).toBe(false);
  });

  it("denies suspended memberships", async () => {
    reset({
      organization_members: [
        { organization_id: "org-1", user_id: "user-1", role: "owner", status: "suspended" },
      ],
    });

    const { getOrganizationAccess } = await import("@/lib/organizations/access");
    const access = await getOrganizationAccess("user-1", "org-1");

    expect(access.canView).toBe(false);
    expect(access.canOperate).toBe(false);
    expect(access.canManage).toBe(false);
  });

  it("does not grant membership across organizations", async () => {
    reset({
      organization_members: [
        { organization_id: "org-1", user_id: "user-1", role: "owner", status: "active" },
      ],
    });

    const { getOrganizationAccess } = await import("@/lib/organizations/access");
    const access = await getOrganizationAccess("user-1", "org-2");

    expect(access.canView).toBe(false);
    expect(access.canManage).toBe(false);
  });

  it("allows privileged platform admins without creating organization membership", async () => {
    reset({
      admin_users: [{ user_id: "admin-1", role: "superadmin" }],
    });

    const { getOrganizationAccess } = await import("@/lib/organizations/access");
    const access = await getOrganizationAccess("admin-1", "org-1");

    expect(access.isPlatformAdmin).toBe(true);
    expect(access.memberRole).toBeNull();
    expect(access.canView).toBe(true);
    expect(access.canOperate).toBe(true);
    expect(access.canManage).toBe(true);
  });
});
