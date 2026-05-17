import type { Metadata } from "next";
import AdminTopBar from "./components/AdminTopBar";

export const metadata: Metadata = {
  title: {
    default: "Admin Dashboard | TheOutHaven",
    template: "%s | TheOutHaven Admin",
  },
  description: "TheOutHaven internal admin dashboard.",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#090706] text-white">
      <AdminTopBar />
      {children}
    </div>
  );
}