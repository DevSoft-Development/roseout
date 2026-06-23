import { redirect } from "next/navigation";

export default async function BusinessCrmDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/dashboard/crm/${id}`);
}
