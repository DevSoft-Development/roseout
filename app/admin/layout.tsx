import type { Metadata } from "next";
import AdminTopBar from "./components/AdminTopBar";
import { requireAdminRole } from "@/lib/admin-auth";
import { noIndexRobots } from "@/lib/seo";

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
  const admin = await requireAdminRole(["superadmin", "admin", "editor", "viewer"]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#090706] text-white">
      <AdminTopBar
        adminName={admin.full_name || "Admin"}
        adminEmail={admin.email || ""}
        adminRole={admin.role}
      />
      {children}
    </div>
  );
}
