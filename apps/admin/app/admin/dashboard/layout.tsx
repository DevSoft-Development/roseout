import type { ReactNode } from "react";
import { getCurrentAdmin } from "@theouthaven/auth/admin-session";
import AdminShell from "./AdminShell";
import "./admin-shell.css";

export default async function AdminDashboardLayout({ children }: { children: ReactNode }) {
  const admin = await getCurrentAdmin();

  return (
    <AdminShell
      adminName={admin.full_name || "Admin"}
      adminEmail={admin.email || ""}
      adminRole={admin.role}
    >
      {children}
    </AdminShell>
  );
}
