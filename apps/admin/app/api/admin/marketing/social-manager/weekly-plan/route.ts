import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

function nextMonday() {
  const now = new Date();
  const day = now.getUTCDay();
  const days = day === 0 ? 1 : 8 - day;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, 16, 0, 0));
}

function fallbackIdeas(theme: string, area: string) {
  return [
    { title:`${area} ${theme}`, hook:`Here’s your next ${theme.toLowerCase()} in ${area}.`, script:"Show the first stop, the second stop, and why they work together.", cta:"Save this for your next outing.", format:"short_video" },
    { title:"Birthday ideas under $100", hook:"Planning a birthday without blowing the budget?", script:"Show a complete birthday-night idea with a clear budget-friendly angle.", cta:"Follow for more outing ideas.", format:"carousel" },
    { title:"Creator outing feature", hook:"We gave a local creator one job: plan a night worth leaving the house for.", script:"Feature a creator-led outing and keep the recommendation personal and visual.", cta:"See more creator picks on TheOutHaven.", format:"creator_video" },
    { title:"Friday Night Picks", hook:"Still figuring out Friday night?", script:"Show one complete dinner-and-activity plan people can use right away.", cta:"Save this for Friday.", format:"short_video" },
    { title:`Tonight in ${area}`, hook:`Here’s a plan for tonight in ${area}.`, script:"Keep it immediate: where to eat, what to do next, and the vibe.", cta:"Send this to the person you’re going with.", format:"short_video" },
    { title:"Something Different", hook:"Tired of doing the same thing every weekend?", script:"Feature an outing that feels unexpected but still easy to plan.", cta:"Follow for something different next week.", format:"carousel" },
    { title:"Next Weekend Preview", hook:"Start next weekend before everyone else does.", script:"Preview a few strong outing ideas and invite people to save the post.", cta:"Follow for next week’s full picks.", format:"short_video" },
  ];
}

async function generateIdeas(theme: string, area: string) {
  const fallback = fallbackIdeas(theme, area);
  if (!process.env.OPENAI_API_KEY) return fallback;

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [{ data: growth }, { data: opportunities }] = await Promise.all([
    supabaseAdmin.from("social_growth_daily_snapshots").select("snapshot_date,provider,top_theme,top_area,reach,website_visits,outing_searches,high_intent_actions").gte("snapshot_date", since).order("snapshot_date", { ascending: false }).limit(100),
    supabaseAdmin.from("social_growth_opportunities").select("title,summary,intent,area,timing,score").eq("status", "new").order("score", { ascending: false }).limit(12),
  ]);

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: process.env.SOCIAL_MANAGER_AI_MODEL || "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 1400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are TheOutHaven's social content strategist. Build useful, local, non-clickbait social content that helps people plan real outings. Never invent venue facts, prices, availability, or partnerships. Return JSON only." },
        { role: "user", content: `Create exactly 7 social content ideas for next week. Return {"ideas":[{"title":"","hook":"","script":"","cta":"","format":"short_video|carousel|creator_video|story"}]}. Mix formats and avoid repetitive hooks. Theme preference: ${theme}. Area preference: ${area}. Recent growth signals: ${JSON.stringify(growth || [])}. Recent community opportunities: ${JSON.stringify(opportunities || [])}. Optimize for saves, shares, useful clicks into TheOutHaven, and outing searches—not vanity engagement.` },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { ideas?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed.ideas) || parsed.ideas.length !== 7) return fallback;
    return parsed.ideas.map((idea, index) => ({
      title: typeof idea.title === "string" && idea.title.trim() ? idea.title.trim().slice(0, 140) : fallback[index].title,
      hook: typeof idea.hook === "string" && idea.hook.trim() ? idea.hook.trim().slice(0, 400) : fallback[index].hook,
      script: typeof idea.script === "string" && idea.script.trim() ? idea.script.trim().slice(0, 1800) : fallback[index].script,
      cta: typeof idea.cta === "string" && idea.cta.trim() ? idea.cta.trim().slice(0, 300) : fallback[index].cta,
      format: ["short_video","carousel","creator_video","story"].includes(String(idea.format)) ? String(idea.format) : fallback[index].format,
    }));
  } catch {
    return fallback;
  }
}

export async function POST(request: Request) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const form = await request.formData();
  const theme = String(form.get("theme") || "Date Night").trim() || "Date Night";
  const area = String(form.get("area") || "New York City").trim() || "New York City";
  const [{ data: connections }, ideas] = await Promise.all([
    supabaseAdmin.from("marketing_social_connections").select("provider").eq("scope", "platform").eq("status", "connected"),
    generateIdeas(theme, area),
  ]);
  const selectedPlatforms = (connections || []).map((row:any)=>row.provider).filter((value:string)=>["instagram","facebook","tiktok","youtube"].includes(value));
  const platforms = selectedPlatforms.length ? selectedPlatforms : ["instagram","tiktok"];
  const monday = nextMonday();
  const rows = ideas.map((idea,index)=>{
    const due = new Date(monday.getTime()+index*24*60*60*1000);
    return {
      scope:"platform",
      title:idea.title,
      content_type:"social_post",
      occasion:index===0?theme:null,
      market:area,
      owner_user_id:admin.user_id,
      status:"draft",
      priority:index===3||index===4?"high":"normal",
      due_at:due.toISOString(),
      approval_status:"not_submitted",
      hook:idea.hook,
      script:idea.script,
      cta:idea.cta,
      selected_platforms:platforms,
      created_by:admin.user_id,
      source_type:"social_manager_weekly_plan",
      metadata:{ weekly_plan:true, ai_generated:Boolean(process.env.OPENAI_API_KEY), week_of:monday.toISOString().slice(0,10), day_index:index, format:idea.format, suggested_video_length:index===3||index===4?"15–20 seconds":"20–30 seconds" },
    };
  });
  const { data, error } = await supabaseAdmin.from("marketing_content_items").insert(rows).select("id");
  if (error) return NextResponse.json({ error:"The weekly drafts could not be created." }, { status:500 });
  return NextResponse.redirect(new URL(`/admin/dashboard/marketing/content?weekly_plan=${data?.length || 0}`, request.url),303);
}
