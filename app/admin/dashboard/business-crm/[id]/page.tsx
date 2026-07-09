import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export default async function LegacyBusinessCrmLocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(ROUTES.adminCrmLocation(id));
}
