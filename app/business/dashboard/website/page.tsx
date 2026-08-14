import { redirect } from "next/navigation";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const location = await getCurrentBusinessLocation();
  if (!location) redirect("/locations/dashboard");

  const type = String((location as any).location_type || "restaurant").toLowerCase().includes("activ") ? "activity" : "restaurant";
  const query = new URLSearchParams({ locationId: location.id, type });
  redirect(`/locations/dashboard/website?${query.toString()}`);
}
