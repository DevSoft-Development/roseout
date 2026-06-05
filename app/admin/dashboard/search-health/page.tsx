import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import SearchHealthClient from "./SearchHealthClient";

export const metadata = {
  title: "Search Health – Admin",
  description:
    "Monitor search issues, no-pair results, slow searches, and regression warnings.",
};

export default async function SearchHealthPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.searchHealth);

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.14),transparent_30%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-rose-200">
            Admin Tools / System
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Search Health</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
            Monitor real search issues, no-pair results, slow searches, walking-route
            suppressions, and search lab debug warnings captured by backend logging.
          </p>
        </section>

        <SearchHealthClient />
      </div>
    </main>
  );
}
