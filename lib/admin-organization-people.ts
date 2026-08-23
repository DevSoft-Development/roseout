import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type AdminOrganizationPerson = {
  userId: string;
  email: string;
  name: string;
  role: string;
};

function displayName(user: any, email: string) {
  const candidate = [
    user?.user_metadata?.full_name,
    user?.user_metadata?.name,
    user?.user_metadata?.display_name,
  ].find((value) => typeof value === "string" && value.trim());
  return String(candidate || email.split("@")[0] || email).trim();
}

function authUserIsActive(user: any) {
  if (!user || user.deleted_at) return false;
  if (!user.banned_until) return true;
  const bannedUntil = new Date(user.banned_until).getTime();
  return Number.isNaN(bannedUntil) || bannedUntil <= Date.now();
}

export async function listAdminOrganizationPeople(): Promise<AdminOrganizationPerson[]> {
  const [{ data: adminRows, error: adminError }, authResult] = await Promise.all([
    supabaseAdmin.from("admin_users").select("user_id,role").order("role", { ascending: true }),
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  if (adminError) throw adminError;
  if (authResult.error) throw authResult.error;

  const authById = new Map((authResult.data.users || []).map((user) => [user.id, user]));
  return (adminRows || [])
    .map((row: any) => {
      if (String(row.role || "").toLowerCase() === "disabled") return null;
      const user = authById.get(row.user_id);
      if (!authUserIsActive(user)) return null;
      const email = String(user?.email || "").trim().toLowerCase();
      if (!email) return null;
      return {
        userId: row.user_id as string,
        email,
        name: displayName(user, email),
        role: String(row.role || "staff"),
      } satisfies AdminOrganizationPerson;
    })
    .filter((person): person is AdminOrganizationPerson => Boolean(person))
    .sort((left, right) => left.name.localeCompare(right.name) || left.email.localeCompare(right.email));
}

export async function getAdminOrganizationPerson(userId: string): Promise<AdminOrganizationPerson | null> {
  if (!userId) return null;
  const people = await listAdminOrganizationPeople();
  return people.find((person) => person.userId === userId) || null;
}

export async function resolveAdminOrganizationPeople(userIds: string[]): Promise<AdminOrganizationPerson[]> {
  const unique = Array.from(new Set(userIds.map((value) => String(value || "").trim()).filter(Boolean)));
  if (!unique.length) return [];
  const people = await listAdminOrganizationPeople();
  const byId = new Map(people.map((person) => [person.userId, person]));
  return unique.map((id) => byId.get(id)).filter((person): person is AdminOrganizationPerson => Boolean(person));
}
