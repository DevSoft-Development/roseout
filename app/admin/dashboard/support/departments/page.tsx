import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import SupportDepartmentRoutingClient from "@/components/admin/SupportDepartmentRoutingClient";

export default async function SupportDepartmentsPage() {
  await requireAdminRole(["superuser", "admin"]);

  return (
    <main className="px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">OutHaven Support</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Department routing</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
            Edit which support ticket categories route to each department and optionally assign a default admin email.
          </p>
          <Link href="/admin/dashboard/support" className="mt-5 inline-flex rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white">
            ← Back to OutHaven Support
          </Link>
        </section>

        <div className="mt-6">
          <SupportDepartmentRoutingClient />
        </div>
      </div>
    </main>
  );
}
