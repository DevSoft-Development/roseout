import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export default async function LegacyRootWorkspaceCrmLocationPage({ params }: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await params;
  redirect(ROUTES.adminCrmLocation(locationId));
}
