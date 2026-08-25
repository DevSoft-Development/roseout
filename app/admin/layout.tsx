import type { Metadata } from "next";
import { headers } from "next/headers";
import AdminTopBar from "./components/AdminTopBar";
import { requireAdminRole } from "@/lib/admin-auth";
import { noIndexRobots } from "@/lib/seo";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getEffectiveAdminPermissions } from "@/lib/admin-role-policy";

export const metadata: Metadata = {
  title: {
    default: "Admin Dashboard | TheOutHaven",
    template: "%s | TheOutHaven Admin",
  },
  description: "TheOutHaven internal admin dashboard.",
  robots: noIndexRobots(),
};

const PUBLIC_ADMIN_PATHS = new Set(["/admin/login", "/admin/unauthorized"]);

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const rawPathname = requestHeaders.get("x-theouthaven-admin-pathname") || "";
  const pathname = rawPathname.length > 1 ? rawPathname.replace(/\/+$/, "") : rawPathname;

  if (PUBLIC_ADMIN_PATHS.has(pathname)) return <>{children}</>;

  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.dashboard);
  const adminPermissions = await getEffectiveAdminPermissions(admin.role);

  return (
    <div className="admin-theme min-h-screen overflow-x-hidden md:pl-[76px] xl:pl-60">
      <AdminTopBar
        adminName={admin.full_name || "Admin"}
        adminEmail={admin.email || ""}
        adminRole={admin.role}
        adminPermissions={adminPermissions}
      />
      <div className="admin-page-shell min-w-0 max-w-full overflow-hidden">{children}</div>
    </div>
  );
}
