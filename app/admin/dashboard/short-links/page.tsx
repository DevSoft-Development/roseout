import type { Metadata } from "next";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/AdminDesignSystem";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import DestinationPicker from "./DestinationPicker";
import ShortLinksConsole from "./ShortLinksConsole";

export const metadata: Metadata = {
  title: "Short Links | Admin",
  description: "Create and manage TheOutHaven branded outhvn.com links.",
};

export const dynamic = "force-dynamic";

export default async function ShortLinksPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.shortLinks);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Operations"
        title="Short Links"
        subtitle="Select a real TheOutHaven destination or create a custom branded outhvn.com link, then manage and measure everything from one place."
      />
      <DestinationPicker />
      <ShortLinksConsole />
    </AdminPageShell>
  );
}
