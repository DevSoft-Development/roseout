import { supabaseAdmin } from "@/lib/supabase-admin";

type Input = { category:string; level?:string; message:string; source?:string|null; actor_id?:string|null; actor_email?:string|null; entity_type?:string|null; entity_id?:string|null; metadata?:Record<string, unknown> };
export async function logAdminEvent(input: Input) {
  const metadata = input.metadata && JSON.stringify(input.metadata).length < 3000 ? input.metadata : {};
  await supabaseAdmin.from('admin_system_logs').insert({ category: input.category, level: input.level || 'info', message: input.message, source: input.source || null, actor_id: input.actor_id || null, actor_email: input.actor_email || null, entity_type: input.entity_type || null, entity_id: input.entity_id || null, metadata });
}
