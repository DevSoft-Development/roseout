import { requireAdminRole } from "@/lib/admin-auth";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const metadata = {
  title: "sms – Admin",
};

export default async function Page() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.sms);

  return (
    <main className="min-h-screen bg-[#090706] p-6 text-white">
      <div className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-[#120d0b] p-6">
        <h1 className="text-2xl font-black capitalize">sms</h1>
        <p className="mt-2 text-sm text-white/70">This admin section is ready for implementation.</p>
      </div>
    </main>
  );
}
