import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, authMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), authMock: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { rpc: rpcMock } }));
vi.mock("@/lib/admin-api-auth", () => ({ requireAdminApiRole: authMock }));
vi.mock("@/lib/admin-permissions", () => ({ ADMIN_PAGE_ACCESS: { import: "import" } }));

import { POST } from "../route";

const params = { params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }) };
function req(body?: string) { return new Request("http://test.local/api/admin/workers/jobs/111/retry", { method: "POST", body }); }
async function json(response: Response) { return response.json(); }

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ error: null });
  rpcMock.mockResolvedValue({ data: { id: "job", status: "queued" }, error: null });
});

describe("worker retry route", () => {
  it("retries with an empty body", async () => {
    const response = await POST(req(), params);
    expect(response.status).toBe(202);
    expect(rpcMock).toHaveBeenCalledWith("retry_worker_job", { p_job_id: "11111111-1111-1111-1111-111111111111", p_grant_attempt: false, p_run_after: null });
  });

  it("retries with a valid run_after", async () => {
    const runAfter = "2026-07-24T14:00:00.000Z";
    const response = await POST(req(JSON.stringify({ run_after: runAfter })), params);
    expect(response.status).toBe(202);
    expect(rpcMock).toHaveBeenCalledWith("retry_worker_job", expect.objectContaining({ p_run_after: runAfter }));
  });

  it("rejects invalid JSON", async () => {
    const response = await POST(req("{"), params);
    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ success: false, code: "INVALID_JSON" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects invalid run_after", async () => {
    const response = await POST(req(JSON.stringify({ run_after: "not-a-date" })), params);
    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ success: false, code: "INVALID_RUN_AFTER" });
  });

  it("rejects invalid grant_attempt", async () => {
    const response = await POST(req(JSON.stringify({ grant_attempt: "yes" })), params);
    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ success: false, code: "INVALID_GRANT_ATTEMPT" });
  });

  it("returns attempts exhausted as a grantable conflict", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "ATTEMPTS_EXHAUSTED", message: "used all allowed attempts" } });
    const response = await POST(req(), params);
    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ success: false, code: "ATTEMPTS_EXHAUSTED", can_grant_attempt: true, error: "used all allowed attempts" });
  });

  it("passes grant_attempt true", async () => {
    const response = await POST(req(JSON.stringify({ grant_attempt: true })), params);
    expect(response.status).toBe(202);
    expect(rpcMock).toHaveBeenCalledWith("retry_worker_job", expect.objectContaining({ p_grant_attempt: true }));
  });

  it("returns a stable generic RPC failure", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "XX000", message: "database unavailable" } });
    const response = await POST(req(), params);
    expect(response.status).toBe(500);
    expect(await json(response)).toEqual({ success: false, code: "RETRY_FAILED", error: "database unavailable" });
  });

  it("preserves admin authorization", async () => {
    const unauthorized = Response.json({ success: false }, { status: 401 });
    authMock.mockResolvedValue({ error: unauthorized });
    const response = await POST(req(), params);
    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("sends exact expected RPC arguments", async () => {
    await POST(req(JSON.stringify({ grant_attempt: true, run_after: "2026-07-24T14:00:00.000Z" })), params);
    expect(rpcMock.mock.calls[0]).toEqual(["retry_worker_job", { p_job_id: "11111111-1111-1111-1111-111111111111", p_grant_attempt: true, p_run_after: "2026-07-24T14:00:00.000Z" }]);
  });
});
