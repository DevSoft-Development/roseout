import { redirect } from "next/navigation";
export default async function SupportRecordRedirect({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; redirect(`/admin/dashboard/support-tickets/${id}`); }
