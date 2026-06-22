import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminLoginRole } from "@/lib/auth/get-admin-login-role";
import { AI_TAG_HELPER_ACCESS_VALUES, AI_TAG_HELPER_SETTINGS_KEY, DEFAULT_AI_TAG_HELPER_SETTINGS, normalizeAiTagHelperSettings } from "@/lib/ai-tag-helper-settings";
async function admin(){const s=await createClient();const {data:{user}}=await s.auth.getUser();if(!user)return null;return await getAdminLoginRole(supabaseAdmin as any,{id:user.id,email:user.email??null})?user:null}
export async function GET(){const user=await admin();if(!user)return NextResponse.json({error:"Forbidden"},{status:403});const {data}=await supabaseAdmin.from("app_settings").select("value").eq("key",AI_TAG_HELPER_SETTINGS_KEY).maybeSingle();return NextResponse.json({settings:normalizeAiTagHelperSettings(data?.value)});}
export async function PATCH(req:Request){const user=await admin();if(!user)return NextResponse.json({error:"Forbidden"},{status:403});const body=await req.json().catch(()=>({}));if(!AI_TAG_HELPER_ACCESS_VALUES.includes(body?.access))return NextResponse.json({error:"Invalid AI Tag Helper access value."},{status:400});const value={...DEFAULT_AI_TAG_HELPER_SETTINGS,access:body.access};const {error}=await supabaseAdmin.from("app_settings").upsert({key:AI_TAG_HELPER_SETTINGS_KEY,value,updated_by:user.id,updated_at:new Date().toISOString()});if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json({success:true,settings:value});}
