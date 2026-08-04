import type { ReactNode } from "react";
import CrmListNavigationMemory from "./CrmListNavigationMemory";
import EnterpriseCrmShell from "@/components/admin/crm/EnterpriseCrmShell";

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <EnterpriseCrmShell>
      <CrmListNavigationMemory />
      {children}
    </EnterpriseCrmShell>
  );
}
