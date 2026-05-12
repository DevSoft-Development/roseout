import { supabaseAdmin } from "@/lib/supabase-admin";

export type SupportDepartmentRoute = {
  id?: string;
  name: string;
  slug: string;
  topics: string[];
  default_admin_email: string | null;
  description: string | null;
  active: boolean;
};

export const DEFAULT_SUPPORT_DEPARTMENTS: SupportDepartmentRoute[] = [
  {
    name: "General Support",
    slug: "general",
    topics: ["General Support", "Account Help"],
    default_admin_email: null,
    description: "General questions, login issues, and account help.",
    active: true,
  },
  {
    name: "Reservations",
    slug: "reservations",
    topics: ["Reservation Help", "Booking Issue", "Cancellation"],
    default_admin_email: null,
    description: "Booking, cancellation, no-show, and reservation flow issues.",
    active: true,
  },
  {
    name: "Locations",
    slug: "locations",
    topics: ["Location Update", "Claim My Business", "Business Profile"],
    default_admin_email: null,
    description:
      "Restaurant/activity owner claims, edits, and listing requests.",
    active: true,
  },
  {
    name: "Billing",
    slug: "billing",
    topics: ["Billing", "Checkout", "Subscription"],
    default_admin_email: null,
    description: "Payment, checkout, subscription, and invoice questions.",
    active: true,
  },
];

function normalizeSlug(value: string) {
  return (
    String(value || "general")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "general"
  );
}

function normalizeTopics(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || "")
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function supportDepartmentSlugForTopic(
  topic: string | null | undefined,
  routes = DEFAULT_SUPPORT_DEPARTMENTS,
) {
  const normalizedTopic = String(topic || "General Support").toLowerCase();
  const match = routes.find((route) =>
    route.topics.some((item) => item.toLowerCase() === normalizedTopic),
  );

  return match?.slug || "general";
}

export async function listSupportDepartmentRoutes() {
  const { data, error } = await supabaseAdmin
    .from("support_department_routes")
    .select("*")
    .order("name", { ascending: true });

  if (error || !data?.length) return DEFAULT_SUPPORT_DEPARTMENTS;

  return data.map((route) => ({
    id: route.id,
    name: route.name || "Support Department",
    slug: normalizeSlug(route.slug || route.name),
    topics: normalizeTopics(route.topics),
    default_admin_email: route.default_admin_email || null,
    description: route.description || null,
    active: route.active !== false,
  })) satisfies SupportDepartmentRoute[];
}

export async function upsertSupportDepartmentRoute(formData: FormData) {
  "use server";

  const id = String(formData.get("id") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const slug = normalizeSlug(String(formData.get("slug") || name));
  const topics = normalizeTopics(formData.get("topics"));
  const defaultAdminEmail = String(formData.get("default_admin_email") || "")
    .trim()
    .toLowerCase();
  const description = String(formData.get("description") || "").trim();
  const active = formData.get("active") === "on";

  if (!name) throw new Error("Department name is required.");

  const payload = {
    name,
    slug,
    topics,
    default_admin_email: defaultAdminEmail || null,
    description: description || null,
    active,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    await supabaseAdmin
      .from("support_department_routes")
      .update(payload)
      .eq("id", id);
    return;
  }

  await supabaseAdmin.from("support_department_routes").upsert(payload, {
    onConflict: "slug",
  });
}
