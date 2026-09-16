import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

function nextMonday() {
  const now = new Date();
  const day = now.getUTCDay();
  const days = day === 0 ? 1 : 8 - day;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, 16, 0, 0));
  return monday;
}

export async function POST(request: Request) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const form = await request.formData();
  const theme = String(form.get("theme") || "Date Night").trim() || "Date Night";
  const area = String(form.get("area") || "New York City").trim() || "New York City";
  const { data: connections } = await supabaseAdmin.from("marketing_social_connections").select("provider").eq("scope", "platform").eq("status", "connected");
  const selectedPlatforms = (connections || []).map((row:any)=>row.provider).filter((value:string)=>["instagram","facebook","tiktok","youtube"].includes(value));
  const platforms = selectedPlatforms.length ? selectedPlatforms : ["instagram","tiktok"];
  const monday = nextMonday();
  const ideas = [
    { title:`${area} ${theme}`, hook:`Here’s your next ${theme.toLowerCase()} in ${area}.`, script:"Show the first stop, the second stop, and why they work together.", cta:"Save this for your next outing." },
    { title:"Birthday ideas under $100", hook:"Planning a birthday without blowing the budget?", script:"Show a complete birthday-night idea with a clear budget-friendly angle.", cta:"Follow for more outing ideas." },
    { title:"Creator outing feature", hook:"We gave a local creator one job: plan a night worth leaving the house for.", script:"Feature a creator-led outing and keep the recommendation personal and visual.", cta:"See more creator picks on TheOutHaven." },
    { title:"Friday Night Picks", hook:"Still figuring out Friday night?", script:"Show one complete dinner-and-activity plan people can use right away.", cta:"Save this for Friday." },
    { title:`Tonight in ${area}`, hook:`Here’s a plan for tonight in ${area}.`, script:"Keep it immediate: where to eat, what to do next, and the vibe.", cta:"Send this to the person you’re going with." },
    { title:"Something Different", hook:"Tired of doing the same thing every weekend?", script:"Feature an outing that feels unexpected but still easy to plan.", cta:"Follow for something different next week." },
    { title:"Next Weekend Preview", hook:"Start next weekend before everyone else does.", script:"Preview a few strong outing ideas and invite people to save the post.", cta:"Follow for next week’s full picks." },
  ];
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
      metadata:{ weekly_plan:true, week_of:monday.toISOString().slice(0,10), day_index:index, suggested_video_length:index===3||index===4?"15–20 seconds":"20–30 seconds" },
    };
  });
  const { data, error } = await supabaseAdmin.from("marketing_content_items").insert(rows).select("id");
  if (error) return NextResponse.json({ error:"The weekly drafts could not be created." }, { status:500 });
  return NextResponse.redirect(new URL(`/admin/dashboard/marketing/content?weekly_plan=${data?.length || 0}`, request.url),303);
}
