import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@/lib/admin-auth";
import { listSupportAdmins } from "@/lib/support";
import {
  listSupportDepartmentRoutes,
  upsertSupportDepartmentRoute,
} from "@/lib/support-routing";

async function saveRoute(formData: FormData) {
  "use server";

  await upsertSupportDepartmentRoute(formData);
  revalidatePath("/admin/dashboard/support");
  revalidatePath("/admin/dashboard/support/routes");
}

export default async function SupportRoutesPage() {
  await requireAdminRole(["superuser", "admin"]);

  const [routes, admins] = await Promise.all([
    listSupportDepartmentRoutes(),
    listSupportAdmins(),
  ]);

  return (
    <main className="px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1200px]">
        <Link
          href="/admin/dashboard/support"
          className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white"
        >
          ← Support inbox
        </Link>

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">
            Routing
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">
            Support department routes
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
            Update which ticket topics route into each department and optionally
            set the default admin owner.
          </p>
        </section>

        <section className="mt-6 grid gap-5">
          {[
            ...routes,
            {
              name: "",
              slug: "",
              topics: [],
              default_admin_email: null,
              description: null,
              active: true,
            },
          ].map((route, index) => (
            <form
              key={route.slug || `new-${index}`}
              action={saveRoute}
              className="rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl"
            >
              <input type="hidden" name="id" value={route.id || ""} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Department name"
                  name="name"
                  defaultValue={route.name}
                  placeholder="Reservations"
                />
                <Field
                  label="Route slug"
                  name="slug"
                  defaultValue={route.slug}
                  placeholder="reservations"
                />
                <label>
                  <span className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
                    Default admin
                  </span>
                  <select
                    name="default_admin_email"
                    defaultValue={route.default_admin_email || ""}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-500"
                  >
                    <option value="">No default owner</option>
                    {admins.map((admin) => (
                      <option key={admin.email} value={admin.email}>
                        {admin.full_name || admin.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-end gap-3 pb-3">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={route.active}
                    className="h-5 w-5"
                  />
                  <span className="text-sm font-black text-white/70">
                    Active route
                  </span>
                </label>
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
                  Topics, one per line
                </span>
                <textarea
                  name="topics"
                  defaultValue={route.topics.join("\n")}
                  rows={4}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-500"
                />
              </label>

              <label className="mt-4 block">
                <span className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
                  Description
                </span>
                <textarea
                  name="description"
                  defaultValue={route.description || ""}
                  rows={2}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-500"
                />
              </label>

              <button className="mt-5 rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg">
                {route.slug ? "Save route" : "Add route"}
              </button>
            </form>
          ))}
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder: string;
}) {
  return (
    <label>
      <span className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
        {label}
      </span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none focus:border-rose-500"
      />
    </label>
  );
}
