import "server-only";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { readAdminUsersListViaCoreApi } from "@/lib/aws/admin-users-core-api";

const openStatuses = ["closed", "resolved"];
const emailKey = (email?: string | null) => String(email || "").trim().toLowerCase();

async function safe<T>(fn: () => Promise<T>, fallback: T) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

function filterDecorated(user: any, filters: Record<string, string | undefined>) {
  const query = emailKey(filters.q);
  if (
    query &&
    ![
      user.full_name,
      user.preferred_name,
      user.email,
      user.phone,
      user.mobile_number,
      user.zip_code,
      user.social_handle,
    ].some((value) => String(value || "").toLowerCase().includes(query))
  ) return false;

  if (filters.beta && filters.beta !== "all" && String(user.beta_status || (user.isBetaUser ? "active" : "none")) !== filters.beta) return false;
  if (filters.plan && filters.plan !== "all" && user.plan !== filters.plan) return false;
  if (filters.email && filters.email !== "all" && (filters.email === "verified") !== Boolean(user.email_confirmed_at || user.email_verified)) return false;
  if (filters.status && filters.status !== "all" && !String(user.account_status).toLowerCase().includes(filters.status)) return false;
  if (filters.tickets === "yes" && user.open_tickets_count < 1) return false;
  if (filters.booked === "yes" && user.booked_outings_count < 1) return false;
  if (filters.role && filters.role !== "all" && String(user.role).toLowerCase() !== filters.role) return false;
  return true;
}

async function countBy(table: string, ids: string[], column = "user_id", mutate?: (query: any) => any) {
  if (!ids.length) return {} as Record<string, number>;
  return safe(async () => {
    const db = getAdminDatabaseClient();
    let query = db.from(table).select(column).in(column, ids);
    if (mutate) query = mutate(query);
    const { data } = await query;
    return (data || []).reduce((acc: Record<string, number>, row: any) => {
      const key = String(row[column] || "");
      if (key) acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, {} as Record<string, number>);
}

async function countTicketsByEmail(emails: string[]) {
  if (!emails.length) return {} as Record<string, number>;
  return safe(async () => {
    const { data } = await getAdminDatabaseClient()
      .from("support_tickets")
      .select("requester_email,email,status")
      .not("status", "in", `(${openStatuses.join(",")})`);
    return (data || []).reduce((acc: Record<string, number>, row: any) => {
      const key = emailKey(row.requester_email || row.email);
      if (key && emails.includes(key)) acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, {} as Record<string, number>);
}

async function listAdminUsersFallback(filters: Record<string, string | undefined>) {
  const db = getAdminDatabaseClient();
  const page = Math.max(1, Number(filters.page || 1));
  const per = 25;

  const [profiles, appUsers, betaRows, betaApps, launchRows, authUsers] = await Promise.all([
    safe(async () => (await db.from("user_profiles").select("*").order("created_at", { ascending: false }).limit(1000)).data || [], [] as any[]),
    safe(async () => (await db.from("users").select("*").order("created_at", { ascending: false }).limit(1000)).data || [], [] as any[]),
    safe(async () => (await db.from("beta_testers").select("*").order("created_at", { ascending: false }).limit(1000)).data || [], [] as any[]),
    safe(async () => (await db.from("beta_applications").select("*").order("created_at", { ascending: false }).limit(1000)).data || [], [] as any[]),
    safe(async () => (await db.from("launch_waitlist_signups").select("*").order("created_at", { ascending: false }).limit(1000)).data || [], [] as any[]),
    safe(async () => (await db.auth.admin.listUsers({ page: 1, perPage: 1000 })).data.users || [], [] as any[]),
  ]);

  const authById = new Map(authUsers.map((user: any) => [user.id, user]));
  const authByEmail = new Map(authUsers.filter((user: any) => user.email).map((user: any) => [emailKey(user.email), user]));
  const merged = new Map<string, any>();

  function findKey(id?: string | null, email?: string | null) {
    if (id && merged.has(`user:${id}`)) return `user:${id}`;
    const normalizedEmail = emailKey(email);
    if (normalizedEmail && merged.has(`email:${normalizedEmail}`)) return `email:${normalizedEmail}`;
    for (const [key, value] of merged) {
      if ((id && (value.id === id || value.user_id === id)) || (normalizedEmail && emailKey(value.email) === normalizedEmail)) return key;
    }
    return id ? `user:${id}` : normalizedEmail ? `email:${normalizedEmail}` : `row:${crypto.randomUUID()}`;
  }

  function put(row: any) {
    const key = findKey(row.id || row.user_id, row.email);
    const previous = merged.get(key) || {};
    const next = {
      ...previous,
      ...row,
      badges: Array.from(new Set([...(previous.badges || []), ...(row.badges || [])])),
      id: row.id || row.user_id || previous.id || previous.user_id,
    };
    if (!next.email) next.email = previous.email;
    if (!next.full_name) next.full_name = previous.full_name || previous.name;
    merged.delete(key);
    merged.set(next.id ? `user:${next.id}` : `email:${emailKey(next.email)}`, next);
  }

  profiles.forEach((row: any) => put({ ...row, hasAccount: true, badges: ["Account User"] }));
  appUsers.forEach((row: any) => put({ ...row, id: row.id || row.user_id, full_name: row.full_name || row.name, hasAccount: true, badges: ["Account User"] }));
  authUsers.forEach((row: any) => put({
    id: row.id,
    email: row.email,
    full_name: row.user_metadata?.full_name || row.user_metadata?.name,
    created_at: row.created_at,
    email_confirmed_at: row.email_confirmed_at,
    hasAccount: true,
    badges: ["Account User"],
  }));
  betaApps.forEach((row: any) => put({
    email: row.email,
    full_name: row.name,
    phone: row.phone,
    beta_status: row.status,
    tester_type: row.tester_type,
    betaApplicationId: row.id,
    created_at: row.created_at,
    badges: ["Beta Applicant"],
  }));
  launchRows.forEach((row: any) => put({
    email: row.email,
    full_name: row.full_name,
    phone: row.phone,
    usually_go_out_area: row.usually_go_out_area,
    social_handle: row.social_handle,
    beta_status: row.beta_application_status,
    giveaway_status: row.giveaway_status,
    launchSignupId: row.id,
    created_at: row.created_at,
    badges: [
      "Launch List",
      row.wants_giveaway && row.giveaway_status === "verified" ? "Giveaway Eligible" : null,
      row.giveaway_status === "pending_beta_tasks" || row.weekly_task_eligibility_status === "pending_beta_tasks" ? "Pending Weekly Tasks" : null,
      !row.email_verified ? "Email Unverified" : null,
    ].filter(Boolean),
  }));
  betaRows.forEach((row: any) => {
    const auth = (row.user_id && authById.get(row.user_id)) || authByEmail.get(emailKey(row.email));
    put({
      id: row.user_id || (auth as any)?.id || undefined,
      email: row.email || (auth as any)?.email,
      full_name: row.name,
      phone: row.phone,
      beta_status: row.status,
      betaTesterId: row.id,
      betaTester: row,
      isBetaUser: true,
      hasAccount: Boolean(row.user_id || (auth as any)?.id),
      created_at: row.created_at,
      badges: ["Beta Tester"],
    });
  });

  const ids = Array.from(new Set(Array.from(merged.values()).map((user: any) => user.id).filter(Boolean))) as string[];
  const emails = Array.from(new Set(Array.from(merged.values()).map((user: any) => emailKey(user.email)).filter(Boolean))) as string[];

  const [admins, saved, booked, ticketsByUser, ticketsByEmail, subscriptions] = await Promise.all([
    safe(async () => ids.length ? (await db.from("admin_users").select("user_id,role").in("user_id", ids)).data || [] : [], [] as any[]),
    countBy("saved_plans", ids),
    countBy("user_outings", ids),
    countBy("support_tickets", ids, "user_id", (query: any) => query.not("status", "in", `(${openStatuses.join(",")})`)),
    countTicketsByEmail(emails),
    safe(async () => ids.length ? (await db.from("customer_subscriptions").select("user_id,plan_key,status").in("user_id", ids).eq("status", "active")).data || [] : [], [] as any[]),
  ]);

  const users = Array.from(merged.values())
    .map((user: any) => {
      const admin = admins.find((row: any) => row.user_id === user.id);
      const subscription = subscriptions.find((row: any) => row.user_id === user.id);
      const auth = user.id ? authById.get(user.id) as any : null;
      const hasAccount = Boolean(user.hasAccount || user.id);
      const emailConfirmed = user.email_confirmed_at || auth?.email_confirmed_at;
      const disabled = user.account_status === "disabled" || user.deleted_at || user.disabled_at || admin?.role === "disabled" || user.role === "disabled";
      return {
        ...user,
        userId: user.id || null,
        rowKey: user.id || user.betaTesterId || user.betaApplicationId || user.launchSignupId || user.email,
        role: admin?.role || user.role || "user",
        plan: subscription?.plan_key || user.plan || (hasAccount ? "free" : "Pending"),
        isBetaUser: Boolean(user.isBetaUser || user.betaTesterId),
        saved_outings_count: user.id ? saved[user.id] || 0 : 0,
        booked_outings_count: user.id ? booked[user.id] || 0 : 0,
        open_tickets_count: (user.id ? ticketsByUser[user.id] || 0 : 0) + (ticketsByEmail[emailKey(user.email)] || 0),
        hasAccount,
        account_status: disabled ? "disabled" : hasAccount ? (emailConfirmed ? "active" : "email_unverified") : "pending_account",
        detailHref: user.id
          ? `/admin/dashboard/users/${user.id}`
          : `/admin/dashboard/users/${user.betaTesterId || user.betaApplicationId || user.launchSignupId}?type=lead`,
      };
    })
    .filter((user: any) => filterDecorated(user, filters))
    .sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

  const from = (page - 1) * per;
  return {
    users: users.slice(from, from + per),
    count: users.length,
    page,
    per,
    hasMore: users.length > from + per,
  };
}

export async function listAdminUsersRead(filters: Record<string, string | undefined> = {}) {
  await requireAdminRole(["superadmin"]);
  try {
    const result = await readAdminUsersListViaCoreApi(filters);
    if (result.success !== true || !Array.isArray(result.users)) throw new Error("admin_users_core_list_invalid");
    return result;
  } catch {
    return listAdminUsersFallback(filters);
  }
}
