import { redirect } from "next/navigation";
export default async function AccountContactsRedirect({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; redirect(`/admin/dashboard/crm/accounts/${id}?tab=contacts`); }
