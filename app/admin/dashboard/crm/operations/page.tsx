import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import CrmViewCard from "@/components/admin/crm/CrmViewCard";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";
const views = [["support","Support","Work support tickets connected to CRM relationships."],["change-requests","Change Requests","Review protected location field changes requested through CRM workspace flows."],["knowledge-base","Knowledge Base","Approved internal CRM workspace articles and training material."],["demo","Demo / Training","Training workspace for CRM demos. Demo mode remains separate from real reservations."],["performance","Performance","CRM operational performance snapshot for outreach, follow-ups, support, claim codes, and site visits."]] as const;
export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) { await requireAdminRole(ADMIN_PAGE_ACCESS.crm); const { view = "support" } = await searchParams; const active = views.find(([key]) => key === view) || views[0]; return <CrmWorkspaceShell><CrmViewCard eyebrow="Operations" active={active} views={views} baseHref="/admin/dashboard/crm/operations" /></CrmWorkspaceShell>; }
