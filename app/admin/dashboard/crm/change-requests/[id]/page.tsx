import { redirect } from "next/navigation";
export default async function ChangeRequestRecordRedirect({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; redirect(`/admin/dashboard/crm/support/${id}?view=change-requests`); }
