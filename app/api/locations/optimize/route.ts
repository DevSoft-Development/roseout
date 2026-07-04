import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminLoginRole } from "@/lib/auth/get-admin-login-role";
import { resolveEditableLocationContext } from "@/lib/auth/locationOwnerAccess";
import { getAiTagHelperSettings } from "@/lib/ai-tag-helper-settings";

export const runtime = "nodejs";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
function tags(v:any){return Array.isArray(v)?v.map(String).filter(Boolean):String(v??"").split(',').map(s=>s.trim()).filter(Boolean)}
function isPaidLocation(row:any){const vals=[row?.plan,row?.subscription_plan,row?.membership_tier,row?.billing_plan,row?.account_type,row?.partner_tier,row?.listing_tier,row?.discovery_status,row?.partner_sales_status].map((v)=>String(v??"").toLowerCase());return vals.some((v)=>/(paid|plus|pro|premium|partner|featured|active)/.test(v)) || row?.is_paid===true || row?.paid===true || row?.subscription_active===true;}
async function authFor(body:any){
  const auth=await createClient();const {data:{user}}=await auth.auth.getUser();
  if(!user)return {ok:false,status:401,error:"Unauthorized" as const,isAdmin:false};
  const isAdmin=Boolean(await getAdminLoginRole(supabaseAdmin as any,{id:user.id,email:user.email??null}));
  const settings=await getAiTagHelperSettings();
  if(settings.access==="off")return {ok:false,status:403,error:"AI Tag Helper is turned off.",isAdmin};
  if(!isAdmin && settings.access==="admins_only")return {ok:false,status:403,error:"AI Tag Helper is limited to admins.",isAdmin};
  const ctx=await resolveEditableLocationContext({userId:user.id,locationId:body.id??body.location_id,adminLocationId:body.adminLocationId,demoLocationId:body.demoLocationId,sourceId:body.sourceId,type:body.type??body.table,demo:body.demo===true||body.demo==="1",fromDemoCenter:body.fromDemoCenter===true||body.fromDemoCenter==="1"});
  if(!ctx)return {ok:false,status:403,error:"You do not have access to this location.",isAdmin};
  if(settings.access==="paid_only" && !isPaidLocation(ctx.location))return {ok:false,status:403,error:"AI Tag Helper is limited to paid locations; paid status could not be confirmed for this location.",isAdmin};
  return {ok:true,isAdmin:ctx.isAdmin,settings,location:ctx.location};
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const gate=await authFor(body); if(!gate.ok) return NextResponse.json({error:gate.error},{status:gate.status});
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });
    const input={
      id: body.id ?? body.location_id ?? null, type: body.type ?? body.table ?? null,
      name: body.name, description: body.description, category: body.category, primary_category: body.primary_category,
      cuisine: body.cuisine, primary_tag: body.primary_tag, semantic_tags: tags(body.semantic_tags), best_for_tags: tags(body.best_for_tags), best_for: tags(body.best_for),
      price_range: body.price_range, city: body.city, neighborhood: body.neighborhood, location_type: body.location_type,
    };
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", temperature: 0.3, max_tokens: 350, response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You suggest draft TheOutHaven profile tags. Return only valid JSON. Do not invent hard factual claims. Do not generate review_keywords. Suggestions do not overwrite existing data." },
        { role: "user", content: `Based on available name, description, category, cuisine, and profile data, suggest only Primary Tag, Cuisine, Search Boost Tags, and Best For Tags. Keep tags short and search-friendly. Use semantic_tags as Search Boost Tags. Do not return date_style_tags, special_features, search_keywords, intent_tags, vibe_tags, or review_keywords.\n\nInput JSON:\n${JSON.stringify(input)}\n\nReturn shape: {"suggestions":{"primary_tag":"Mediterranean restaurant","cuisine":"Mediterranean","semantic_tags":["hookah","shisha"],"best_for_tags":["date night"]},"confidence":"high|medium|low","reason":"Based on name, description, category, cuisine, and existing profile data."}` }
      ],
    });
    const parsed=JSON.parse(completion.choices[0]?.message?.content || "{}");
    const suggestions=parsed.suggestions||{};
    return NextResponse.json({suggestions:{primary_tag:String(suggestions.primary_tag??"").trim(),cuisine:String(suggestions.cuisine??"").trim(),semantic_tags:tags(suggestions.semantic_tags).slice(0,8),best_for_tags:tags(suggestions.best_for_tags).slice(0,8)},confidence:parsed.confidence||"medium",reason:parsed.reason||"Based on name, description, category, cuisine, and existing profile data."});
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Optimization failed." }, { status: 500 }); }
}
