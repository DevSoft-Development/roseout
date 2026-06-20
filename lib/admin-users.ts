import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requirePublicEnv, requireSupabaseUrl } from "@/lib/env";
import { getSiteUrl } from "@/lib/site-url";

export const adminUserAccessRoles = ADMIN_PAGE_ACCESS.experienceInboxManage;
export async function requireAdminOrSupport() { return requireAdminRole(adminUserAccessRoles); }
export function like(s?: string | null) { return `%${String(s || "").trim().replace(/[%,]/g, "")}%`; }
async function safe<T>(fn: () => Promise<T>, fallback: T) { try { return await fn(); } catch { return fallback; } }
const emailKey = (email?: string | null) => String(email || "").trim().toLowerCase();
const openStatuses = ["closed", "resolved"];

export async function listAdminUsers(filters: { q?: string; role?: string; beta?: string; plan?: string; status?: string; tickets?: string; booked?: string; page?: number }) {
  await requireAdminOrSupport();
  const page = Math.max(1, Number(filters.page || 1));
  const per = 25;
  const [profiles, appUsers, betaRows, authUsers] = await Promise.all([
    safe(async () => (await supabaseAdmin.from("user_profiles").select("*").order("created_at", { ascending: false }).limit(1000)).data || [], [] as any[]),
    safe(async () => (await supabaseAdmin.from("users").select("*").order("created_at", { ascending: false }).limit(1000)).data || [], [] as any[]),
    safe(async () => (await supabaseAdmin.from("beta_testers").select("*").order("created_at", { ascending: false }).limit(1000)).data || [], [] as any[]),
    safe(async () => (await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })).data.users || [], [] as any[]),
  ]);

  const authById = new Map(authUsers.map((u: any) => [u.id, u]));
  const authByEmail = new Map(authUsers.filter((u: any) => u.email).map((u: any) => [emailKey(u.email), u]));
  const merged = new Map<string, any>();
  const rowKey = (id?: string | null, email?: string | null, betaId?: string | null) => id ? `user:${id}` : emailKey(email) ? `email:${emailKey(email)}` : `beta:${betaId}`;
  const findKey = (id?: string | null, email?: string | null, betaId?: string | null) => {
    if (id && merged.has(`user:${id}`)) return `user:${id}`;
    const e = emailKey(email);
    if (e && merged.has(`email:${e}`)) return `email:${e}`;
    if (id) for (const [k, v] of merged) if (v.id === id || v.user_id === id) return k;
    if (e) for (const [k, v] of merged) if (emailKey(v.email) === e) return k;
    return rowKey(id, email, betaId);
  };
  const put = (row: any) => {
    const k = findKey(row.id || row.user_id, row.email, row.betaTesterId || row.beta_tester_id);
    const prev = merged.get(k) || {};
    const next = { ...prev, ...row, id: row.id || row.user_id || prev.id || prev.user_id };
    if (!next.email) next.email = prev.email;
    if (!next.full_name) next.full_name = prev.full_name || prev.name;
    merged.delete(k);
    merged.set(rowKey(next.id, next.email, next.betaTesterId), next);
  };

  profiles.forEach((p: any) => put({ ...p, hasAccount: true }));
  appUsers.forEach((u: any) => put({ ...u, id: u.id || u.user_id, full_name: u.full_name || u.name, hasAccount: true }));
  authUsers.forEach((u: any) => put({ id: u.id, email: u.email, full_name: u.user_metadata?.full_name || u.user_metadata?.name, created_at: u.created_at, email_confirmed_at: u.email_confirmed_at, hasAccount: true }));
  betaRows.forEach((b: any) => {
    const auth = (b.user_id && authById.get(b.user_id)) || authByEmail.get(emailKey(b.email));
    put({ id: b.user_id || auth?.id || undefined, email: b.email || auth?.email, full_name: b.name, phone: b.phone, beta_status: b.status, betaStatus: b.status, betaTesterId: b.id, betaTester: b, isBetaUser: true, hasAccount: Boolean(b.user_id || auth?.id), created_at: b.created_at, role: "Beta Tester" });
  });

  const ids = Array.from(new Set(Array.from(merged.values()).map((u: any) => u.id).filter(Boolean)));
  const emails = Array.from(new Set(Array.from(merged.values()).map((u: any) => emailKey(u.email)).filter(Boolean)));
  const [admins, saved, booked, ticketsByUser, ticketsByEmail, subs] = await Promise.all([
    safe(async () => ids.length ? (await supabaseAdmin.from("admin_users").select("user_id,role").in("user_id", ids)).data || [] : [], [] as any[]),
    countBy("saved_plans", ids), countBy("user_outings", ids),
    countBy("support_tickets", ids, "user_id", (q: any) => q.not("status", "in", `(${openStatuses.join(",")})`)),
    countByEmails(emails),
    safe(async () => ids.length ? (await supabaseAdmin.from("customer_subscriptions").select("user_id,plan_key,status").in("user_id", ids).eq("status", "active")).data || [] : [], [] as any[]),
  ]);

  let users = Array.from(merged.values()).map((u: any) => decorate(u, { admins, saved, booked, ticketsByUser, ticketsByEmail, subs, authById })).filter((u: any) => filterDecorated(u, filters));
  users = users.sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const from = (page - 1) * per;
  return { users: users.slice(from, from + per), count: users.length, page, per, hasMore: users.length > from + per };
}
function filterDecorated(u: any, f: any) { const q = emailKey(f.q); if (q && ![u.full_name, u.preferred_name, u.email, u.phone, u.mobile_number, u.zip_code].some((v) => String(v || "").toLowerCase().includes(q))) return false; if (f.beta && f.beta !== "all" && String(Boolean(u.isBetaUser)) !== f.beta) return false; if (f.plan && f.plan !== "all" && u.plan !== f.plan) return false; if (f.tickets === "yes" && u.open_tickets_count < 1) return false; if (f.booked === "yes" && u.booked_outings_count < 1) return false; if (f.role && f.role !== "all" && String(u.role).toLowerCase() !== f.role) return false; return true; }
function decorate(u: any, x: any) { const admin = x.admins.find((a: any) => a.user_id === u.id); const sub = x.subs.find((a: any) => a.user_id === u.id); const auth = u.id ? x.authById.get(u.id) : null; const hasAccount = Boolean(u.hasAccount || u.id); const emailConfirmed = u.email_confirmed_at || auth?.email_confirmed_at; return { ...u, userId: u.id || null, rowKey: u.id || u.betaTesterId, role: u.isBetaUser && !admin ? "Beta Tester" : admin?.role || u.role || "user", beta_status: u.beta_status || u.betaStatus || null, betaStatus: u.beta_status || u.betaStatus || null, plan: sub?.plan_key || u.plan || (hasAccount ? "free" : "Pending"), isBetaUser: Boolean(u.isBetaUser || u.beta_status), saved_outings_count: u.id ? x.saved[u.id] || 0 : 0, booked_outings_count: u.id ? x.booked[u.id] || 0 : 0, open_tickets_count: (u.id ? x.ticketsByUser[u.id] || 0 : 0) + (x.ticketsByEmail[emailKey(u.email)] || 0), hasAccount, accountStatus: hasAccount ? (emailConfirmed ? "Account Active" : "Email Unconfirmed") : "Pending Account", account_status: hasAccount ? (emailConfirmed ? "Account Active" : "Email Unconfirmed") : "Pending Account", detailHref: u.id ? `/admin/dashboard/users/${u.id}` : `/admin/dashboard/users/${u.betaTesterId}?type=beta` }; }
async function countBy(table: string, ids: string[], col = "user_id", mut?: (q: any) => any) { if (!ids.length) return {}; return safe(async () => { let q = supabaseAdmin.from(table).select(col).in(col, ids); if (mut) q = mut(q); const { data } = await q; return (data || []).reduce((a: any, r: any) => (a[r[col]] = (a[r[col]] || 0) + 1, a), {}); }, {} as Record<string, number>); }
async function countByEmails(emails: string[]) { if (!emails.length) return {}; return safe(async () => { const { data } = await supabaseAdmin.from("support_tickets").select("requester_email,email,status").not("status", "in", `(${openStatuses.join(",")})`); return (data || []).reduce((a: any, r: any) => { const e = emailKey(r.requester_email || r.email); if (emails.includes(e)) a[e] = (a[e] || 0) + 1; return a; }, {}); }, {} as Record<string, number>); }

export async function getAdminUserDetail(userId: string) { await requireAdminOrSupport(); const { data: profile } = await supabaseAdmin.from("user_profiles").select("*").eq("id", userId).maybeSingle(); const auth = await safe(async () => (await supabaseAdmin.auth.admin.getUserById(userId)).data.user, null as any); let beta = await safe(async () => { const { data } = await supabaseAdmin.from("beta_testers").select("*").or(`user_id.eq.${userId}${profile?.email || auth?.email ? `,email.eq.${profile?.email || auth?.email}` : ""}`).maybeSingle(); return data; }, null as any); if (!profile && !auth && !beta) beta = await safe(async () => (await supabaseAdmin.from("beta_testers").select("*").eq("id", userId).maybeSingle()).data, null as any); const id = profile?.id || auth?.id || beta?.user_id || null; const email = profile?.email || auth?.email || beta?.email || null; const [admin, saved, booked, res, tickets, usage, sub, assignments, feedback, bugs] = await Promise.all([safe(async () => id ? (await supabaseAdmin.from("admin_users").select("role").eq("user_id", id).maybeSingle()).data : null, null as any), id ? listRows("saved_plans", id) : Promise.resolve([]), id ? listRows("user_outings", id) : Promise.resolve([]), id ? listRows("location_reservations", id) : Promise.resolve([]), listTickets(id || userId, email), id ? listRows("search_usage_events", id, "auth_user_id") : Promise.resolve([]), safe(async () => id ? (await supabaseAdmin.from("customer_subscriptions").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle()).data : null, null as any), beta?.id ? listRows("beta_task_assignments", beta.id, "tester_id") : Promise.resolve([]), beta?.id ? listRows("beta_feedback", beta.id, "tester_id") : Promise.resolve([]), beta?.id ? listRows("beta_bug_reports", beta.id, "tester_id") : Promise.resolve([])]); const hasAccount = Boolean(id); return { profile: { ...(profile || {}), id: id || beta?.id || userId, email, full_name: profile?.full_name || beta?.name, phone: profile?.phone || beta?.phone, role: admin?.role || (beta && !hasAccount ? "Beta Tester" : profile?.role || "user"), plan: sub?.plan_key || profile?.plan || (hasAccount ? "free" : "Pending"), email_confirmed_at: auth?.email_confirmed_at, created_at: profile?.created_at || auth?.created_at || beta?.created_at, account_status: hasAccount ? (auth?.email_confirmed_at ? "Account Active" : "Email Unconfirmed") : "Pending Account", hasAccount }, beta, saved, booked, reservations: res, tickets, usage, subscription: sub, betaAssignments: assignments, betaFeedback: feedback, betaBugReports: bugs }; }
async function listRows(table: string, userId: string, col = "user_id") { return safe(async () => { const { data } = await supabaseAdmin.from(table).select("*").eq(col, userId).order("created_at", { ascending: false }).limit(50); return data || []; }, [] as any[]); }
export async function listTickets(userId: string, email?: string | null) { return safe(async () => { const { data } = await supabaseAdmin.from("support_tickets").select("*").or(`user_id.eq.${userId}${email ? `,requester_email.eq.${email},email.eq.${email}` : ""}`).order("updated_at", { ascending: false }).limit(50); return data || []; }, [] as any[]); }
export async function updateAdminUserProfile(userId: string, input: any) { const safeFields = ["full_name", "preferred_name", "phone", "mobile_number", "zip_code", "sms_opt_in", "age_range", "birthday_month", "birthday_day", "birthday_opt_in"]; const row: any = { updated_at: new Date().toISOString() }; for (const k of safeFields) if (k in input) row[k] = input[k] || null; const { data, error } = await supabaseAdmin.from("user_profiles").upsert({ id: userId, ...row }, { onConflict: "id" }).select("*").single(); if (error) throw error; return data; }
export async function sendUserPasswordReset(email: string) { const authClient = createSupabaseClient(requireSupabaseUrl(), requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } }); const redirectTo = `${getSiteUrl().replace(/\/$/, "")}/reset-password`; const { error } = await authClient.auth.resetPasswordForEmail(email, { redirectTo }); if (error) throw error; }
