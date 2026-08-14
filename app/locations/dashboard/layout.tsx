import CanonicalLocationModuleNav from "./CanonicalLocationModuleNav";

export default function LocationsDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <CanonicalLocationModuleNav />
      {children}
    </>
  );
}
