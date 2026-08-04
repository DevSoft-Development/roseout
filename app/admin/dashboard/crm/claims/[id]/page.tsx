import { redirect } from "next/navigation";
export default async function ClaimRecordRedirect({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; redirect(`/admin/dashboard/claims?claim=${id}`); }
