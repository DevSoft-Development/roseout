const workerSecret = Deno.env.get("WORKER_INTERNAL_SECRET") ?? "";
const appUrl = (Deno.env.get("APP_URL") || "https://theouthaven.com").replace(/\/+$/, "");

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  const supplied = request.headers.get("x-worker-secret") ?? request.headers.get("x-internal-worker-secret") ?? "";
  if (!secureCompare(supplied, workerSecret)) return json({ success: false, error: "Unauthorized" }, 401);

  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(body.limit || 100), 250));
  const startedAt = Date.now();

  try {
    const response = await fetch(`${appUrl}/api/internal/billing/reconcile`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-worker-secret": workerSecret,
      },
      body: JSON.stringify({ limit, source: "supabase_edge" }),
    });
    const text = await response.text();
    let result: Record<string, unknown> = {};
    try { result = text ? JSON.parse(text) : {}; } catch { result = { raw: text.slice(0, 1000) }; }

    if (!response.ok) {
      return json({ success: false, error: `Billing reconciliation endpoint returned ${response.status}`, result, durationMs: Date.now() - startedAt }, 500);
    }

    return json({ success: true, durationMs: Date.now() - startedAt, ...result });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - startedAt }, 500);
  }
});

function secureCompare(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
