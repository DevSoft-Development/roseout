import AdminTopBar from "./components/AdminTopBar";

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