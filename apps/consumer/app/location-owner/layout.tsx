import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({ title: "Location Owner", path: "/location-owner", noIndex: true });

export default async function LocationOwnerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    redirect("/login?next=/location-owner/dashboard");
  }

  const access = await getLocationOwnerAccess(user.id);
  if (!access.isAdmin && access.ownedLocationIds.length === 0 && access.ownedSourceLocationIds.length === 0) {
    redirect("/create");
  }

  return children;
}
