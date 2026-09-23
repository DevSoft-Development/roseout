import { notFound } from "next/navigation";
import { LeadContractClient } from "@/components/private-events/LeadContractClient";
import { getPublicLocationLead } from "@/lib/leads/private-events";

export const dynamic = "force-dynamic";

export default async function PrivateEventContractPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lead = await getPublicLocationLead(token);
  if (!lead) notFound();
  return <LeadContractClient lead={lead as any} />;
}
