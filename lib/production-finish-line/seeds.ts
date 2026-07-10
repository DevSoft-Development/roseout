export const STATUS_OPTIONS = ["not_started","in_progress","blocked","needs_codex","pr_open","testing","passed","skipped"] as const;
export type ProductionStatus = (typeof STATUS_OPTIONS)[number];
export const statusLabels: Record<string,string> = { not_started:"Not started", in_progress:"In progress", blocked:"Blocked", needs_codex:"Needs Codex", pr_open:"PR open", testing:"Testing", passed:"Passed", skipped:"Skipped" };

export const gateSeeds = [
  ["Search Reliability","P0"],
  ["Location Access","P0"],
  ["Owner Dashboard","P0"],
  ["Reserve","P0"],
  ["QR Claim Flow","P0"],
  ["Security","P0"],
  ["Production Checks","P0"],
  ["Beta Program","P1"],
  ["25-Card Pilot","P1"],
  ["Public Pages & SEO","P1"],
  ["Billing & Plans","P1"],
  ["Email, Cron & Monitoring","P1"],
  ["Data Quality & Supabase","P1"],
  ["Mobile QA","P1"],
].map(([title,priority],i)=>({item_type:"gate",sort_order:i+1,title,priority,status:"not_started",owner:"Ops",notes:"",test_url:"",codex_task_url:"",github_pr_url:""}));

const taskWeeks = {
 "Week 1":[
  "Build Production Command Center",
  "Load top search prompts",
  "Run top 10 search prompts",
  "Run mixed outing search prompts",
  "Run restaurant-only search prompts",
  "Run activity-only search prompts",
  "Fix Search: No Results Issues",
  "Fix Search: No Pair Issues",
  "Confirm search cards render structured data only",
  "Confirm no text-only fallback appears when records exist",
  "Re-test Search Prompts",
 ],
 "Week 2":[
  "Build access matrix",
  "Test superadmin access",
  "Test admin access",
  "Test demo admin access",
  "Test owner dashboard access",
  "Test location admin access",
  "Test view-only access restrictions",
  "Test logged-out access restrictions",
  "Fix false no-access errors",
  "Confirm impersonation/demo context works safely",
  "Confirm owner dashboard links work end to end",
  "Confirm menu editor access works by role",
  "Confirm photo upload access works by role",
  "Confirm marketing and recommended details access works by role",
 ],
 "Week 3":[
  "Test Reserve reservations",
  "Test reservation persists after refresh",
  "Test check-in status",
  "Test assign table/resource status",
  "Test seated status",
  "Test complete visit status",
  "Test waitlist",
  "Test waitlist persists after refresh",
  "Test walk-ins",
  "Test walk-in persists after refresh",
  "Test layout builder opens from Reserve",
  "Test QR claim code",
  "Test invalid QR claim code safe error",
  "Test owner claim approval",
  "Test beta signup",
  "Test beta weekly completion",
  "Test beta completion email sends once",
 ],
 "Week 4":[
  "Security checklist review",
  "Harden debug/admin/cron routes",
  "Service-role guard review",
  "Confirm admin APIs reject non-admin users",
  "Confirm cron routes fail closed without secrets",
  "Confirm no secrets are exposed in logs or UI",
  "Production command results",
  "Full web smoke test",
  "Public home page smoke test",
  "Public create/search smoke test",
  "Public location profile smoke test",
  "Public business claim smoke test",
  "SEO metadata review",
  "Privacy/terms/footer link review",
  "Mobile QA pass",
  "25-card pilot setup",
 ],
 "Final 2 Days":[
  "Run production-check strict",
  "Run build/typecheck/lint commands",
  "Run search production test suite",
  "Run reserve/location editor test suite",
  "Review Vercel production environment variables",
  "Review Supabase migrations applied",
  "Review RLS/admin policy safety",
  "Review Stripe test/live mode settings",
  "Review Resend/email sender settings",
  "Review Turnstile settings",
  "Review monitoring and admin digest emails",
  "Go/No-Go review",
  "Launch small pilot monitoring",
 ],
} as const;

function gateForTask(task: string) {
  const text = task.toLowerCase();
  if (text.includes("search") || text.includes("prompts") || text.includes("cards") || text.includes("fallback")) return "Search Reliability";
  if (text.includes("access") || text.includes("owner") || text.includes("impersonation") || text.includes("menu") || text.includes("photo") || text.includes("marketing") || text.includes("recommended")) return "Location Access";
  if (text.includes("reserve") || text.includes("reservation") || text.includes("waitlist") || text.includes("walk-in") || text.includes("layout") || text.includes("seated")) return "Reserve";
  if (text.includes("qr") || text.includes("claim")) return "QR Claim Flow";
  if (text.includes("beta")) return "Beta Program";
  if (text.includes("security") || text.includes("service") || text.includes("debug") || text.includes("cron") || text.includes("secrets") || text.includes("admin api") || text.includes("rls")) return "Security";
  if (text.includes("seo") || text.includes("privacy") || text.includes("terms") || text.includes("footer") || text.includes("public")) return "Public Pages & SEO";
  if (text.includes("stripe") || text.includes("billing") || text.includes("plans")) return "Billing & Plans";
  if (text.includes("email") || text.includes("resend") || text.includes("monitoring") || text.includes("digest")) return "Email, Cron & Monitoring";
  if (text.includes("supabase") || text.includes("migration") || text.includes("data")) return "Data Quality & Supabase";
  if (text.includes("mobile")) return "Mobile QA";
  if (text.includes("production") || text.includes("build") || text.includes("typecheck") || text.includes("lint") || text.includes("test suite") || text.includes("vercel")) return "Production Checks";
  return "25-Card Pilot";
}

export const dailyTaskSeeds = Object.entries(taskWeeks).flatMap(([week,tasks])=>tasks.map((task,i)=>({item_type:"daily_task",week,day:`Day ${i+1}`,title:task,gate: gateForTask(task),status:"not_started",sort_order:0,notes:"",codex_task_url:"",github_pr_url:""})));

export const checklistSeeds = (type:string, items:string[]) => items.map((title,i)=>({item_type:type,title,status:"not_started",sort_order:i+1,priority:type==="security"?"P0":"P1",owner:"Ops",notes:"",codex_task_url:"",github_pr_url:""}));

export const reserveSeeds = checklistSeeds("reserve", [
  "Create reservation",
  "Refresh and confirm reservation remains",
  "Check in reservation",
  "Assign table/resource",
  "Confirm status becomes seated",
  "Move reservation time if supported",
  "Cancel reservation",
  "Mark no-show",
  "Complete visit",
  "Create waitlist entry",
  "Refresh and confirm waitlist remains",
  "Notify waitlist guest if supported",
  "Convert waitlist to reservation if supported",
  "Create walk-in",
  "Refresh and confirm walk-in remains",
  "Assign walk-in to table/resource",
  "QR tools open from Reserve",
  "Embed booking page route loads",
]);

export const betaSeeds = checklistSeeds("beta", [
  "Beta signup submitted",
  "Turnstile passed",
  "Beta application created",
  "Beta tester row created",
  "Auth user linked",
  "Password setup email sent",
  "User lands on /user/dashboard/beta",
  "Weekly task assigned",
  "Weekly task completed",
  "Success message appears under submit button",
  "Journey Map shows 5/5",
  "Completion email sends once",
  "Reload does not duplicate email",
  "Admin can review beta feedback",
  "Beta reminders are scheduled safely",
]);

export const securitySeeds = checklistSeeds("security", [
  "Admin debug routes gated",
  "/api/debug disabled or admin-gated",
  "Cron routes fail closed",
  "No query-string secrets in production cron",
  "Service-role routes have auth checks",
  "Public endpoints have safe payloads",
  "Manual admin triggers require admin",
  "Secrets not exposed in UI/logs",
  "npm audit high-risk review completed",
  "Sensitive admin pages require admin auth",
  "Owner/location routes enforce owned location access",
  "Demo mode cannot edit real production locations",
  "View-only users cannot create/edit/delete",
  "RLS policy review completed",
  "Storage bucket permissions reviewed",
  "Webhook routes verify signatures where applicable",
]);

export const searchPromptSeeds = [
  "steak dinner and rooftop drinks 30 minute walk apart",
  "girls night dinner with cocktails",
  "seafood dinner with theatre after",
  "rooftop dinner in Queens",
  "seafood rooftop restaurant",
  "chicken lunch in Astoria",
  "bar with wings nyc",
  "best bar to watch the Knicks game in Harlem",
  "steak dinner and hookah lounge after",
  "restaurant with activity walking distance",
  "casual dinner and relaxed activity",
  "sushi dinner and karaoke after in Queens",
  "Italian dinner and comedy show after",
  "brunch and museum after in Brooklyn",
  "date night dinner and jazz lounge after",
].map((prompt,i)=>({prompt,expected_result:"Relevant restaurants and/or outing pairs for the prompt",actual_result:"",status:"not_started",issue_type:"",notes:"",sort_order:i+1,codex_task_url:"",github_pr_url:""}));

export const roles = ["Superadmin","Admin","Demo Admin","Owner","Location Admin","View Only","Logged Out"];
export const areas = ["Location Dashboard","Location Editor","Menu Editor","Photo Upload","Recommended Details","Marketing Center","Reserve Dashboard","Public Profile","QR Tools","Analytics","Billing/Plan"];
export const accessSeeds = roles.flatMap((role,ri)=>areas.map((area,ai)=>({role_name:role,area_name:area,expected_behavior: role==="Logged Out"?"Redirect to login or public-safe view":"Access according to role permissions",actual_behavior:"",status:"not_started",notes:"",sort_order:ri*areas.length+ai+1,codex_task_url:"",github_pr_url:""})));
export const qrSeeds = Array.from({length:25},(_,i)=>({pilot_number:i+1,location_id:"",location_name:`Pilot location ${i+1}`,address:"",claim_code:`PILOT-${String(i+1).padStart(2,"0")}`,claim_url:`/business/claim?code=PILOT-${String(i+1).padStart(2,"0")}`,qr_verified:false,postcard_printed:false,mailed:false,scanned:false,claim_started:false,claim_submitted:false,claim_approved:false,owner_dashboard_works:false,status:"not_started",notes:"",codex_task_url:"",github_pr_url:""}));

export const commandSeeds = [
  "npm run production-check:strict",
  "npm run production-check:live",
  "npm run typecheck",
  "npm run lint",
  "npm run build",
  "npm run test:search-production",
  "npm run test:search-quality",
  "npm run test:search-route-regression",
  "npm run test:enterprise-search",
  "npm run test:reserve",
  "npm run test:location-editor",
  "npm run test:beta-production-readiness",
  "npm run test:beta-guided-route",
  "npm run test:e2e",
  "npm run audit:admin-routes",
  "npm run audit:env",
].map((command,i)=>({command,last_run_date:null,result:"not_run",runner:"",notes:"",sort_order:i+1,codex_task_url:"",github_pr_url:""}));

export const decisionSeed = { item_type:"decision",title:"Go / No-Go Decision",status:"blocked",notes:"",owner:"",codex_task_url:"",github_pr_url:"" };
