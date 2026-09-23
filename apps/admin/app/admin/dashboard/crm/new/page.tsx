import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { ensureClaimFields, upsertLocationClaimCode } from "@/lib/claimQrServer";
import { logAdminEvent } from "@/lib/admin/logAdminEvent";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

const inputClass =
  "min-h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3.5 text-sm font-semibold text-white outline-none transition placeholder:text-white/25 focus:border-rose-300/60 focus:ring-4 focus:ring-rose-500/10";

const clean = (formData: FormData, key: string) =>
  String(formData.get(key) || "").trim() || null;

async function createLocation(formData: FormData) {
  "use server";

  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.crmEdit);
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Location name is required.");

  const locationType =
    String(formData.get("location_type") || "restaurant").trim().toLowerCase() ===
    "activity"
      ? "activity"
      : "restaurant";
  const now = new Date().toISOString();
  const claimFields = await ensureClaimFields(
    {},
    {
      table: "locations",
      regenerateCode: true,
      regenerateToken: true,
      regenerateQr: true,
      forceCanonicalUrl: true,
    },
  );

  const payload = {
    name,
    location_name: name,
    location_type: locationType,
    category: clean(formData, "category"),
    cuisine: locationType === "restaurant" ? clean(formData, "cuisine") : null,
    activity_type:
      locationType === "activity" ? clean(formData, "activity_type") : null,
    address: clean(formData, "address"),
    city: clean(formData, "city"),
    borough: clean(formData, "borough"),
    neighborhood: clean(formData, "neighborhood"),
    state: clean(formData, "state"),
    zip_code: clean(formData, "zip_code"),
    phone: clean(formData, "phone"),
    website: clean(formData, "website"),
    description: clean(formData, "description"),
    status: "pending",
    is_searchable: false,
    public_visibility_tier: "internal",
    quality_status: "needs_review",
    admin_review_status: "pending_review",
    created_source: "admin_crm",
    created_at: now,
    updated_at: now,
    ...claimFields,
  };

  const { data, error } = await getAdminDatabaseClient()
    .from("locations")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await upsertLocationClaimCode(data.id, claimFields);
  await logAdminEvent({
    category: "crm",
    action: "location_created",
    level: "info",
    message: `Location created from CRM: ${name}`,
    actor_user_id: admin.user_id,
    actor_email: admin.email,
    entity_type: "location",
    entity_id: String(data.id),
    metadata: { location_type: locationType, created_source: "admin_crm" },
  });

  revalidatePath("/admin/dashboard/crm");
  redirect(`/admin/dashboard/crm/${data.id}?tab=profile&created=1`);
}

function Field({
  name,
  label,
  placeholder,
  type = "text",
}: {
  name: string;
  label: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-white/70">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        className={inputClass}
      />
    </label>
  );
}

export default async function NewCrmLocationPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.crmEdit);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Locations CRM · New Record"
        title="Add Location"
        subtitle="Create the canonical location record once, then manage its profile, ownership, reservations, guests, revenue, marketing, and lifecycle from CRM."
        badge={<AdminStatusBadge tone="blue">Internal until reviewed</AdminStatusBadge>}
        actions={
          <AdminActionButton href="/admin/dashboard/crm">
            Back to Locations CRM
          </AdminActionButton>
        }
      />

      <form action={createLocation} className="space-y-5">
        <AdminSectionCard className="p-5">
          <div className="mb-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">
              Identity
            </p>
            <h2 className="mt-1 text-xl font-black">Location basics</h2>
            <p className="mt-1 text-sm text-white/50">
              New locations start internal and non-searchable. Review the CRM record before publishing.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="grid gap-2 text-sm font-bold text-white/70">
              <span>Location type</span>
              <select name="location_type" defaultValue="restaurant" className={inputClass}>
                <option value="restaurant">Restaurant</option>
                <option value="activity">Activity</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold text-white/70 md:col-span-1 xl:col-span-2">
              <span>Location name</span>
              <input name="name" required placeholder="Business or venue name" className={inputClass} />
            </label>
            <Field name="category" label="Category" placeholder="Steakhouse, bowling, museum..." />
            <Field name="cuisine" label="Cuisine" placeholder="Italian, sushi, Caribbean..." />
            <Field name="activity_type" label="Activity type" placeholder="Bowling, museum, comedy..." />
          </div>
        </AdminSectionCard>

        <AdminSectionCard className="p-5">
          <div className="mb-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">
              Location
            </p>
            <h2 className="mt-1 text-xl font-black">Address & contact</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="grid gap-2 text-sm font-bold text-white/70 md:col-span-2 xl:col-span-3">
              <span>Street address</span>
              <input name="address" placeholder="123 Main Street" className={inputClass} />
            </label>
            <Field name="city" label="City" />
            <Field name="borough" label="Borough" />
            <Field name="neighborhood" label="Neighborhood" />
            <Field name="state" label="State" placeholder="NY" />
            <Field name="zip_code" label="ZIP code" />
            <Field name="phone" label="Phone" type="tel" />
            <Field name="website" label="Website" type="url" placeholder="https://..." />
          </div>
        </AdminSectionCard>

        <AdminSectionCard className="p-5">
          <label className="grid gap-2 text-sm font-bold text-white/70">
            <span>Description</span>
            <textarea
              name="description"
              rows={5}
              placeholder="Plain factual description of the location."
              className="w-full rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/25 focus:border-rose-300/60 focus:ring-4 focus:ring-rose-500/10"
            />
          </label>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
            <p className="max-w-2xl text-sm text-white/45">
              After creation, CRM opens Location Details so you can finish hours, photos, search tuning, reservation links, owner/claim status, and publishability.
            </p>
            <button className="min-h-11 rounded-xl bg-rose-600 px-5 text-sm font-black text-white shadow-lg shadow-rose-950/30 transition hover:bg-rose-500">
              Create Location
            </button>
          </div>
        </AdminSectionCard>
      </form>
    </AdminPageShell>
  );
}
