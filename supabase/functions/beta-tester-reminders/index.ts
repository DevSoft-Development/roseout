import { handleOptions } from "../_shared/cors.ts";
import { ok } from "../_shared/response.ts";

Deno.serve((req) => {
  const options = handleOptions(req);
  if (options) return options;

  return ok({
    success: true,
    disabled: true,
    message: "beta-tester-reminders is disabled. Use the Next.js beta reminder system instead.",
  });
});
