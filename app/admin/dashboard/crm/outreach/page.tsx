import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import CrmViewCard from "@/components/admin/crm/CrmViewCard";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";
const views = [["claims","Claims","Claim review workspace and owner relationship handoff."],["claim-codes","Claim Codes","Audited claim-code delivery workspace. Public verification remains /business/claim?code=TOH-XXXX-XXXX."],["social-outreach","Social Outreach","Social outreach planning and status tracking."],["site-visits","Site Visits","Plan and record site visit CRM work."],["mailers","Mailer Tracking","Partner outreach and claim-code mailer tracking."]] as const;
export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) { await requireAdminRole(ADMIN_PAGE_ACCESS.crm); const { view = "claims" } = await searchParams; const active = views.find(([key]) => key === view) || views[0]; return <CrmWorkspaceShell><CrmViewCard eyebrow="Outreach" active={active} views={views} baseHref="/admin/dashboard/crm/outreach" /></CrmWorkspaceShell>; }
