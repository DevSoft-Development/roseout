import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, searchMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  searchMock: vi.fn(),
}));
vi.mock("@/lib/admin-api-auth", () => ({ requireAdminApiRole: authMock }));
vi.mock("@/lib/search/runSearch", () => ({ runOutingSearch: searchMock }));
vi.mock("@/lib/admin-permissions", () => ({ ADMIN_PAGE_ACCESS: { searchHealth: "admin" } }));

import { POST } from "./route";

function request(searchCoreOverride: "legacy" | "v2" | "compare") {
  return new Request("http://localhost/api/admin/beta/search-lab", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "date night", searchCoreOverride }),
  });
}

describe("Search Lab route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ adminUser: { user_id: "admin-1" } });
  });

  it("returns a structured safe V2 retrieval error", async () => {
    searchMock.mockRejectedValue(new Error("SEARCH_V2_RETRIEVAL_FAILED:private database detail"));
    const response = await POST(request("v2"));
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      error: "Search Core V2 could not retrieve locations.",
      code: "SEARCH_V2_RETRIEVAL_FAILED",
      searchCoreOverride: "v2",
    });
    expect(body.requestId).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain("private database detail");
  });

  it("preserves Legacy success when V2 fails", async () => {
    searchMock.mockImplementation(({ searchCoreOverride }) =>
      searchCoreOverride === "legacy"
        ? Promise.resolve({ cards: [{ id: "legacy" }] })
        : Promise.reject(new Error("SEARCH_V2_RETRIEVAL_FAILED:sql detail")),
    );
    const body = await (await POST(request("compare"))).json();
    expect(body.legacy).toMatchObject({ ok: true, result: { cards: [{ id: "legacy" }] } });
    expect(body.v2).toMatchObject({ ok: false, error: { code: "SEARCH_V2_RETRIEVAL_FAILED" } });
  });

  it("preserves V2 success when Legacy fails", async () => {
    searchMock.mockImplementation(({ searchCoreOverride }) =>
      searchCoreOverride === "v2"
        ? Promise.resolve({ cards: [{ id: "v2" }] })
        : Promise.reject(new Error("legacy internal failure")),
    );
    const body = await (await POST(request("compare"))).json();
    expect(body.legacy).toMatchObject({ ok: false, error: { code: "SEARCH_LAB_COMPARE_FAILED" } });
    expect(body.v2).toMatchObject({ ok: true, result: { cards: [{ id: "v2" }] } });
  });
});
