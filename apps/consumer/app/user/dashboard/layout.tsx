import { requireUserForDashboard } from "@/lib/user-dashboard";

export default async function UserDashboardLayout({ children }: { children: React.ReactNode }) {
  await requireUserForDashboard();
  return children;
}
