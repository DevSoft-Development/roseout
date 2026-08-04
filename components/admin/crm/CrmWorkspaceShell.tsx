import CrmPageHeader from "./CrmPageHeader";

export default function CrmWorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <CrmPageHeader
        eyebrow="Admin CRM"
        title="CRM Workspace"
        description="Manage business accounts, outreach, claims, support, and assigned work."
      />
      {children}
    </section>
  );
}
