import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

const RESERVED = new Set(["new", "admin", "dashboard", "api", "manage", "create", "edit", "settings", "tickets", "check-in"]);

export function normalizePublicSlug(input: string) {
  const slug = input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 90)
    .replace(/-+$/g, "");
  if (!slug) return "listing";
  return RESERVED.has(slug) ? `${slug}-listing` : slug;
}

export async function allocatePublicSlug(
  table: "events" | "experiences",
  title: string,
  requested?: string | null,
) {
  const base = normalizePublicSlug(requested || title);
  let candidate = base;
  for (let index = 0; index < 50; index += 1) {
    const { data, error } = await supabaseAdmin.from(table).select("id").ilike("slug", candidate).limit(1);
    if (error) throw error;
    if (!data?.length) return candidate;
    candidate = `${base}-${index + 2}`;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}
