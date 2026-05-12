import { getCurrentAdmin } from "@/lib/admin-auth";
import AdminTopBar from "./components/AdminTopBar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adminUser = await getCurrentAdmin();
  return (
    <div className="min-h-screen bg-[#090706] text-white">
      <AdminTopBar adminUser={adminUser} />
      {children}
    </div>
  );
}