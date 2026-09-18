import type { ReactNode } from "react";
import EnterpriseCrmWorkspaceShell from "@/components/admin/crm/EnterpriseCrmWorkspaceShell";

export default async function CrmLocationWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <EnterpriseCrmWorkspaceShell locationId={id}>
      {children}
    </EnterpriseCrmWorkspaceShell>
  );
}
