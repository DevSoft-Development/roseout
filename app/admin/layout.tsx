import type { Metadata } from "next";
import AdminTopBar from "./components/AdminTopBar";
import { requireAdminRole } from "@/lib/admin-auth";
import { noIndexRobots } from "@/lib/seo";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const metadata: Metadata = {
  title: {
    default: "Admin Dashboard | TheOutHaven",
    template: "%s | TheOutHaven Admin",
  },
  description: "TheOutHaven internal admin dashboard.",
  robots: noIndexRobots(),
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.dashboard);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#050505] text-white xl:pl-64">
      <AdminTopBar
        adminName={admin.full_name || "Admin"}
        adminEmail={admin.email || ""}
        adminRole={admin.role}
      />
      <div className="min-w-0 max-w-full">{children}</div>
    </div>
  );
}
