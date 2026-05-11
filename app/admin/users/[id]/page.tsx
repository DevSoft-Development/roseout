import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminUserDetailRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/admin/dashboard/users/${encodeURIComponent(id)}`);
}
