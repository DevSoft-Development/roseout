import "server-only";

import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeBetaEmail } from "@/lib/beta/programAccess";

export type BetaAccountReadiness = {
  loginReady: boolean;
  authUserExists: boolean;
  authEmailConfirmed: boolean;
  betaTesterLinked: boolean;
  betaTesterUserId: string | null;
  betaTesterStatus: string | null;
  launchEmailVerified: boolean;
  launchEmailVerifiedAt: string | null;
  needsSetupEmail: boolean;
  reason: string;
};

type LaunchEntry = { email?: string | null; email_verified?: boolean | null; email_verified_at?: string | null };
type BetaTester = { id?: string | null; email?: string | null; user_id?: string | null; status?: string | null };

export function buildBetaAccountReadiness(input: { entry: LaunchEntry; betaTester?: BetaTester | null; authUser?: Pick<User, "id" | "email" | "email_confirmed_at" | "confirmed_at" | "last_sign_in_at"> | null }): BetaAccountReadiness {
  const tester = input.betaTester || null;
  const authUser = input.authUser || null;
  const betaTesterLinked = Boolean(tester?.id);
  const betaTesterUserId = tester?.user_id || (authUser?.id ?? null);
  const authUserExists = Boolean(authUser?.id || tester?.user_id);
  const authEmailConfirmed = Boolean(authUser?.email_confirmed_at || authUser?.confirmed_at);
  const launchEmailVerified = Boolean(input.entry.email_verified || input.entry.email_verified_at);
  const betaTesterStatus = tester?.status || null;
  const activeOrApproved = ["active", "approved"].includes(String(betaTesterStatus || ""));

  // Existing beta repair/invite flow links beta_testers.user_id only after a usable Supabase Auth account exists.
  // Therefore a linked active/approved beta tester with a user_id should not be blocked by a stale launch flag.
  const usableAuthAccount = authUserExists && (authEmailConfirmed || Boolean(tester?.user_id) || launchEmailVerified);
  const loginReady = betaTesterLinked && activeOrApproved && usableAuthAccount;

  let reason = "Account setup is missing.";
  if (!betaTesterLinked) reason = authUserExists ? "Auth user exists, but no beta tester row is linked." : "No linked beta tester account found.";
  else if (!activeOrApproved) reason = `Beta tester status is ${betaTesterStatus || "unknown"}.`;
  else if (loginReady && launchEmailVerified) reason = "Linked beta tester account is ready.";
  else if (loginReady) reason = "Linked beta tester account is ready; launch email flag is not synced.";
  else if (authUserExists) reason = "Auth user exists, but setup is not confirmed as usable yet.";

  return { loginReady, authUserExists, authEmailConfirmed, betaTesterLinked, betaTesterUserId, betaTesterStatus, launchEmailVerified, launchEmailVerifiedAt: input.entry.email_verified_at || null, needsSetupEmail: !loginReady, reason };
}

export async function getAccountReadinessMapsForEmails(emails: string[]) {
  const normalized = Array.from(new Set(emails.map(normalizeBetaEmail).filter(Boolean)));
  const [testerResult, usersResult] = await Promise.all([
    normalized.length ? supabaseAdmin.from("beta_testers").select("id,email,user_id,status").in("email", normalized) : Promise.resolve({ data: [] as any[] }),
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const betaByEmail = new Map<string, BetaTester>();
  for (const tester of testerResult.data || []) betaByEmail.set(normalizeBetaEmail(tester.email), tester);
  const authByEmail = new Map<string, User>();
  const authById = new Map<string, User>();
  for (const user of usersResult.data?.users || []) {
    if (user.email) authByEmail.set(normalizeBetaEmail(user.email), user);
    authById.set(user.id, user);
  }
  return { betaByEmail, authByEmail, authById };
}

export async function getBetaAccountReadinessForEntries<T extends LaunchEntry>(entries: T[]) {
  const maps = await getAccountReadinessMapsForEmails(entries.map((entry) => entry.email || ""));
  return entries.map((entry) => {
    const email = normalizeBetaEmail(entry.email);
    const betaTester = maps.betaByEmail.get(email) || null;
    const authUser = (betaTester?.user_id && maps.authById.get(betaTester.user_id)) || maps.authByEmail.get(email) || null;
    return buildBetaAccountReadiness({ entry, betaTester, authUser });
  });
}

export async function getBetaAccountReadinessForEmail(entry: LaunchEntry) {
  const [readiness] = await getBetaAccountReadinessForEntries([entry]);
  return readiness;
}
