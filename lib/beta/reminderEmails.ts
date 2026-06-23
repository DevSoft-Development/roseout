import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendRawBrandedEmail } from "@/lib/email";
import { buildSiteUrl } from "@/lib/site-url";
import { getCurrentWeekStart } from "./weeklyTasks";
import type { BetaReminderType as PublicBetaReminderType } from "@/types/beta";
type BetaReminderType="weekly_start"|"midweek_nudge"|"daily_incomplete"|"friday_final"|"completed_weekly_goal";

const reminderTypeMap: Record<string, BetaReminderType> = {
  weekly_tasks: "weekly_start",
  midweek_reminder: "midweek_nudge",
  daily_incomplete_reminder: "daily_incomplete",
  friday_final_reminder: "friday_final",
  completed_weekly_goal: "completed_weekly_goal",
  weekly_start: "weekly_start",
  midweek_nudge: "midweek_nudge",
  daily_incomplete: "daily_incomplete",
  friday_final: "friday_final",
};
async function shouldSendBetaReminder(testerId:string, reminderType:BetaReminderType, weekStart:string) {
  const { data } = await supabaseAdmin.from("beta_email_reminders").select("id").eq("tester_id", testerId).eq("reminder_type", reminderType).eq("week_start", weekStart).in("status", ["sent", "pending"]).limit(1);
  return !(data && data.length);
}
const subjects:Record<BetaReminderType,string>={weekly_start:"Your weekly TheOutHaven beta tasks are ready",midweek_nudge:"Reminder: complete your TheOutHaven beta tasks",daily_incomplete:"Action needed: beta tasks still open",friday_final:"Final reminder: complete beta tasks by tonight",completed_weekly_goal:"Thank you — you completed your weekly beta tasks"};
type EmailInput={name?:string;completed:number;required?:number;taskLinks?:{title:string;href:string}[]};
function reminderBody(input:EmailInput){const required=input.required??5;const remaining=Math.max(0,required-input.completed);const dashboard=buildSiteUrl("/user/dashboard/beta");return `Hi ${input.name||"there"},

Your TheOutHaven Beta Tester Program tasks for this week are ready. Each task should take less than 10 minutes.

Open your beta dashboard:
${dashboard}

Progress: ${input.completed}/${required} complete. ${remaining} remaining.
${input.taskLinks?.length?`\nOpen tasks:\n${input.taskLinks.map((l)=>`- ${l.title}: ${l.href}`).join("\n")}`:""}

Complete your weekly beta tasks to stay eligible for the $100 Beta Tester Reward, along with any required social follow/tag verification.

TheOutHaven Team`;}
function completedBody(name?:string){const dashboard=buildSiteUrl("/user/dashboard/beta");return `Hi ${name||"there"},

Thank you for completing your TheOutHaven weekly beta tasks.

Your weekly beta task goal is complete for this week, and your progress has been recorded.

Completing your weekly beta tasks helps you stay eligible for the $100 Beta Tester Reward, along with any required social follow/tag verification.

Open your beta dashboard:
${dashboard}

Thank you for helping test and improve TheOutHaven.

TheOutHaven Team`;}
async function taskLinks(testerId:string,weekStart:string){const {data}=await supabaseAdmin.from("beta_task_assignments").select("id,status,assigned_prompt,beta_tasks(title,predefined_prompt,prompt_mode,custom_prompt_required)").eq("tester_id",testerId).eq("assigned_week_start",weekStart).neq("status","completed").limit(5);return (data||[]).map((a:any)=>{const prompt=a.assigned_prompt||a.beta_tasks?.predefined_prompt; const needsCustom=a.beta_tasks?.custom_prompt_required; const base=`/user/dashboard/beta/tasks/${a.id}`; return {title:a.beta_tasks?.title||"Beta task",href:needsCustom?buildSiteUrl(base):buildSiteUrl(`${base}${prompt?`?prompt=${encodeURIComponent(prompt)}&usedCustomPrompt=false`:""}`)};});}
export async function sendBetaReminderEmail({testerId,reminderType}:{testerId:string;reminderType:BetaReminderType}){const weekStart=getCurrentWeekStart(); if(!(await shouldSendBetaReminder(testerId,reminderType,weekStart)))return {status:"skipped"}; const {data:tester}=await supabaseAdmin.from("beta_testers").select("*").eq("id",testerId).maybeSingle(); if(!tester?.email)return {status:"skipped"}; const links=reminderType==="completed_weekly_goal"?[]:await taskLinks(testerId,weekStart); const completed=Number(tester.weekly_completed_tests||0); const subject=subjects[reminderType]; const isCompleted=reminderType==="completed_weekly_goal"; const mailBody=isCompleted?completedBody(tester.name):reminderBody({name:tester.name,completed,required:tester.weekly_required_tests||5,taskLinks:links}); const inserted=await supabaseAdmin.from("beta_email_reminders").insert({tester_id:testerId,email:tester.email,reminder_type:reminderType,subject,status:"pending",week_start:weekStart,weekly_required_tests:tester.weekly_required_tests||5,weekly_completed_tests:completed,incomplete_task_count:links.length,task_links:links}).select("id").single(); const result=await sendRawBrandedEmail({to:tester.email,department:"support",subject,heading:isCompleted?"Weekly beta tasks completed":subject,body:mailBody,cta:{label:"Open Beta Dashboard",url:buildSiteUrl("/user/dashboard/beta")},replyTo:"support@theouthaven.com"}); const status=result.status==="error"?"failed":result.status==="sent"?"sent":"skipped"; await supabaseAdmin.from("beta_email_reminders").update({status,sent_at:status==="sent"?new Date().toISOString():null,error_message:result.error??null}).eq("id",inserted.data?.id); return {status};}

export async function sendBetaRemindersForActiveTesters(reminderType: PublicBetaReminderType | BetaReminderType | string) {
  const mapped = reminderTypeMap[String(reminderType)] || "weekly_start";
  const { data } = await supabaseAdmin.from("beta_testers").select("id").in("status", ["active", "approved"]).limit(1000);
  const results = [];
  for (const tester of data || []) {
    results.push(await sendBetaReminderEmail({ testerId: tester.id, reminderType: mapped }));
  }
  return results;
}
