import { handleOptions } from "../_shared/cors.ts";
import { ok, serverError } from "../_shared/response.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  const elapsed = startTimer();
  const functionName = "admin-crm-list";
  let supabase: any = null;

  try {
    supabase = createSupabaseAdminClient();
    const auth = await requireAdmin(req, supabase);
    if (auth.response) return auth.response;

    const body = await req.json().catch(() => ({}));
    const page = Math.max(Number(body.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(body.pageSize ?? 25), 1), 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const search = String(body.search ?? "").trim();

    let query = supabase.from("locations").select("id,name,restaurant_name,activity_name,address,city,state,zip_code,email,phone,location_type,has_photos,photo_status,image_url,claim_status,created_at,updated_at", { count: "exact" }).range(from, to).order("updated_at", { ascending: false, nullsFirst: false });
    if (search) {
      const safe = search.replace(/[%_,]/g, " ").trim();
      query = query.or(`name.ilike.%${safe}%,restaurant_name.ilike.%${safe}%,activity_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%,address.ilike.%${safe}%,city.ilike.%${safe}%,zip_code.ilike.%${safe}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const response = { success: true, rows: data ?? [], total: count ?? 0, page, pageSize, hasMore: from + (data?.length ?? 0) < (count ?? 0), timingMs: body.debug ? elapsed() : undefined };
    await logEdgeFunctionRun(supabase, { function_name: functionName, status: "success", duration_ms: elapsed(), input_summary: { page, pageSize, search }, output_summary: { rows: data?.length ?? 0, total: count ?? 0 } });
    return ok(response);
  } catch (error) {
    if (supabase) await logEdgeFunctionRun(supabase, { function_name: functionName, status: "error", duration_ms: elapsed(), error_message: safeError(error).message });
    return serverError("admin-crm-list failed", safeError(error));
  }
});
