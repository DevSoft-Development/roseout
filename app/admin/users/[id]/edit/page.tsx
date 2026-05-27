import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { requireAdminRole } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const ADMIN_USERS_BASE_PATH = "/admin/dashboard/users";
const THEOUTHAVEN_SITE_URL = "https://www.theouthaven.com";

const VALID_ROLES = [
  "user",
  "owner",
  "viewer",
  "editor",
  "reviewer",
  "admin",
  "superuser",
  "disabled",
];

const ADMIN_ROLES = ["superuser", "admin", "editor", "reviewer", "viewer"];

const SUBSCRIPTION_STATUSES = [
  { label: "No subscription", value: "" },
  { label: "Free", value: "free" },
  { label: "Trialing", value: "trialing" },
  { label: "Active", value: "active" },
  { label: "Past due", value: "past_due" },
  { label: "Canceled", value: "canceled" },
  { label: "Incomplete", value: "incomplete" },
  { label: "Unpaid", value: "unpaid" },
];

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
};

type EditableUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string | null;
};

type AdminUserRow = {
  email: string | null;
  full_name: string | null;
  role: string | null;
};

type AuthMetadata = {
  role?: unknown;
  full_name?: unknown;
  name?: unknown;
};

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

function cleanString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: FormDataEntryValue | null) {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function editErrorRedirect(userId: string, message: string): never {
  redirect(`${ADMIN_USERS_BASE_PATH}/${userId}/edit?error=${encodeURIComponent(message)}`);
}

function getPasswordResetRedirectUrl() {
  return `${THEOUTHAVEN_SITE_URL}/reset-password`;
}

async function updateUser(formData: FormData) {
  "use server";

  await requireAdminRole(["superuser"]);

  const userId = cleanString(formData.get("user_id"));
  const email = cleanString(formData.get("email")).toLowerCase();
  const fullName = nullableString(formData.get("full_name"));
  const phone = nullableString(formData.get("phone"));
  const role = cleanString(formData.get("role")) || "user";
  const subscriptionStatus = nullableString(formData.get("subscription_status"));
  const stripeCustomerId = nullableString(formData.get("stripe_customer_id"));
  const stripeSubscriptionId = nullableString(formData.get("stripe_subscription_id"));

  if (!userId) redirect(ADMIN_USERS_BASE_PATH);

  if (!email) {
    editErrorRedirect(userId, "Email is required.");
  }

  if (!VALID_ROLES.includes(role)) {
    editErrorRedirect(userId, "Invalid role selected.");
  }

  const supabase = adminSupabase();

  const [{ data: existingUser }, { data: existingAuthUser }] = await Promise.all([
    supabase.from("users").select("email").eq("id", userId).maybeSingle(),
    supabase.auth.admin.getUserById(userId),
  ]);

  const authUpdates: {
    email: string;
    user_metadata: {
      full_name: string | null;
      role: string;
      disabled: boolean;
    };
  } = {
    email,
    user_metadata: {
      full_name: fullName,
      role,
      disabled: role === "disabled",
    },
  };

  const { error: authError } = await supabase.auth.admin.updateUserById(userId, authUpdates);

  if (authError) {
    editErrorRedirect(userId, authError.message);
  }

  const { error: userError } = await supabase.from("users").upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      phone,
      role,
      subscription_status: subscriptionStatus,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
    },
    { onConflict: "id" },
  );

  if (userError) {
    editErrorRedirect(userId, userError.message);
  }

  const previousEmail = (existingUser?.email || existingAuthUser.user?.email || null)?.toLowerCase();
  if (previousEmail && previousEmail !== email) {
    await supabase.from("admin_users").delete().eq("email", previousEmail);
  }

  if (ADMIN_ROLES.includes(role)) {
    await supabase.from("admin_users").upsert(
      {
        email,
        full_name: fullName,
        role,
      },
      { onConflict: "email" },
    );
  } else {
    await supabase.from("admin_users").delete().eq("email", email);
  }

  redirect(`${ADMIN_USERS_BASE_PATH}/${userId}?updated=1`);
}

async function sendPasswordReset(formData: FormData) {
  "use server";

  await requireAdminRole(["superuser"]);

  const userId = cleanString(formData.get("user_id"));

  if (!userId) redirect(ADMIN_USERS_BASE_PATH);

  const user = await getEditableUser(userId);
  const email = user?.email;

  if (!email) {
    editErrorRedirect(userId, "This user does not have an email address for password reset.");
  }

  const { error } = await adminSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: getPasswordResetRedirectUrl(),
  });

  if (error) {
    editErrorRedirect(userId, error.message);
  }

  redirect(
    `${ADMIN_USERS_BASE_PATH}/${userId}/edit?message=${encodeURIComponent(
      `Password reset email sent to ${email}.`,
    )}`,
  );
}

function getMetadataName(metadata: AuthMetadata) {
  if (typeof metadata.full_name === "string") {
    return metadata.full_name;
  }

  if (typeof metadata.name === "string") {
    return metadata.name;
  }

  return null;
}

function getMetadataRole(metadata: AuthMetadata) {
  return typeof metadata.role === "string" ? metadata.role : null;
}

async function getEditableUser(id: string) {
  const supabase = adminSupabase();

  const [{ data: profileUser }, { data: authResult }] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id,email,full_name,phone,role,subscription_status,stripe_customer_id,stripe_subscription_id,created_at",
      )
      .eq("id", id)
      .maybeSingle<EditableUser>(),
    supabase.auth.admin.getUserById(id),
  ]);

  const authUser = authResult.user;

  if (!profileUser && !authUser) {
    return null;
  }

  const authMetadata = (authUser?.user_metadata || {}) as AuthMetadata;
  const email = (profileUser?.email || authUser?.email || null)?.toLowerCase() || null;
  let adminUser: AdminUserRow | null = null;

  if (email) {
    const { data } = await supabase
      .from("admin_users")
      .select("email, full_name, role")
      .eq("email", email)
      .maybeSingle<AdminUserRow>();

    adminUser = data || null;
  }

  const role = profileUser?.role || getMetadataRole(authMetadata) || adminUser?.role || "user";

  return {
    id,
    email,
    full_name: profileUser?.full_name || getMetadataName(authMetadata) || adminUser?.full_name || null,
    phone: profileUser?.phone || null,
    role,
    subscription_status: profileUser?.subscription_status || null,
    stripe_customer_id: profileUser?.stripe_customer_id || null,
    stripe_subscription_id: profileUser?.stripe_subscription_id || null,
    created_at: profileUser?.created_at || authUser?.created_at || null,
  } satisfies EditableUser;
}

function formatDate(value: string | null) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function EditAdminUserPage({ params, searchParams }: PageProps) {
  await requireAdminRole(["superuser"]);

  const { id } = await params;
  const { error, message } = await searchParams;
  const user = await getEditableUser(id);

  if (!user) notFound();

  const displayRole = user.role || "user";

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-10 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1000px]">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_35%),linear-gradient(135deg,#160b0b,#090706_55%,#140f0a)] p-5 shadow-2xl sm:p-6">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-rose-500/20 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.3em] text-rose-300">
                Superuser User Editor
              </p>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Edit User
              </h1>
              <p className="mt-3 text-sm text-white/60">
                Update account profile, access role, subscription, and Stripe IDs.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`${ADMIN_USERS_BASE_PATH}/${user.id}`}
                className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white"
              >
                View User
              </Link>
              <Link
                href={ADMIN_USERS_BASE_PATH}
                className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white"
              >
                Back to Users
              </Link>
            </div>
          </div>
        </section>

        {error && (
          <div className="mt-5 rounded-2xl border border-red-300/30 bg-red-500/10 p-4 text-sm font-bold text-red-100">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-5 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">
            {message}
          </div>
        )}

        <section className="mt-5 rounded-[1.75rem] border border-white/10 bg-[#f8f3ef] text-[#1b1210] shadow-2xl">
          <div className="border-b border-black/10 bg-[#fffaf6] p-5">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-black/45">
              User ID {user.id}
            </p>
            <h2 className="mt-2 text-2xl font-black">{user.email || "No email"}</h2>
            <p className="mt-1 text-sm font-bold text-black/45">
              Current role: {displayRole} • Joined {formatDate(user.created_at)}
            </p>
          </div>

          <form action={updateUser} className="grid gap-5 p-5">
            <input type="hidden" name="user_id" value={user.id} />

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Full Name" name="full_name" defaultValue={user.full_name || ""} />
              <Field label="Email" name="email" type="email" defaultValue={user.email || ""} required />
              <Field label="Phone" name="phone" defaultValue={user.phone || ""} />

              <label className="block">
                <span className="text-sm font-black">Role</span>
                <select
                  name="role"
                  defaultValue={displayRole}
                  className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 font-bold outline-none focus:border-rose-500"
                >
                  <option value="user">User</option>
                  <option value="owner">Owner</option>
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="admin">Admin</option>
                  <option value="superuser">Superuser</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-black">Subscription Status</span>
                <select
                  name="subscription_status"
                  defaultValue={user.subscription_status || ""}
                  className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 font-bold outline-none focus:border-rose-500"
                >
                  {SUBSCRIPTION_STATUSES.map((status) => (
                    <option key={status.value || "none"} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Stripe Customer ID"
                name="stripe_customer_id"
                defaultValue={user.stripe_customer_id || ""}
              />
              <Field
                label="Stripe Subscription ID"
                name="stripe_subscription_id"
                defaultValue={user.stripe_subscription_id || ""}
              />
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800 md:flex-row md:items-center md:justify-between">
              <p>
                Superusers can edit all account fields here. To change this user&apos;s password,
                send them a secure password reset email.
              </p>
              <button
                type="submit"
                form="send-password-reset"
                className="rounded-full border border-rose-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-wide text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!user.email}
              >
                Send change password link
              </button>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="submit"
                className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg hover:scale-[1.03]"
              >
                Save User
              </button>

              <Link
                href={`${ADMIN_USERS_BASE_PATH}/${user.id}`}
                className="rounded-full border border-black/10 px-6 py-3 text-sm font-black"
              >
                Cancel
              </Link>
            </div>
          </form>

          <form id="send-password-reset" action={sendPasswordReset}>
            <input type="hidden" name="user_id" value={user.id} />
          </form>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue = "",
  placeholder,
  required = false,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 font-bold outline-none focus:border-rose-500"
      />
    </label>
  );
}
