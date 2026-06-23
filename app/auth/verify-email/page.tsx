import { redirect } from "next/navigation";
import { consumeAuthEmailToken } from "@/lib/auth/authEmailTokens";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string>> }) { const sp=await searchParams; const token=String(sp.token||""); const consumed=await consumeAuthEmailToken({token,purpose:"signup_verify"}); if(!consumed.valid) redirect("/auth/verified?status=invalid"); const row=consumed.token; if(row.user_id) await supabaseAdmin.auth.admin.updateUserById(row.user_id,{email_confirm:true}); await supabaseAdmin.from("user_profiles").update({email_verified:true,email_verified_at:new Date().toISOString()} as any).eq("id",row.user_id); await supabaseAdmin.from("users").update({email_verified:true,email_verified_at:new Date().toISOString()} as any).eq("id",row.user_id); redirect("/auth/verified?status=success"); }
