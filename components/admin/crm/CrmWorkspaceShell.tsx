"use client";

import { usePathname } from "next/navigation";
import CommunicationCenter from "@/components/admin/crm/CommunicationCenter";

export default function CrmWorkspaceShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isCrmHome = pathname === "/admin/dashboard/crm";

  return (
    <section className="min-w-0 space-y-5">
      {isCrmHome ? <CommunicationCenter /> : null}
      {children}
    </section>
  );
}
