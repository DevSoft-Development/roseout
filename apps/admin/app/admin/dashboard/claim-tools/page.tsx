import type { Metadata } from "next";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import ClaimToolsClient from "./ClaimToolsClient";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";

export const metadata: Metadata = {
  title: "Claim Tools",
  description: "Search claim codes, links, and QR codes.",
};

export default async function AdminClaimToolsPage() {
  await requireAdminRole(["superadmin", "admin", "ambassador"]);

  return (
    <AdminPageShell>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-sheet { display: grid !important; }
        }
      `}</style>
      <div className="no-print">
        <AdminPageHeader
          eyebrow="Claims · Operations"
          title="Claim Codes + QR Codes"
          subtitle="Search locations, restaurants, and activities to copy claim codes, secure claim links, preview or print QR codes, regenerate claim credentials, and synchronize claim fields."
          badge={<AdminStatusBadge tone="green">Claim tooling online</AdminStatusBadge>}
          actions={
            <>
              <AdminActionButton href="/admin/dashboard/claim-qrs" variant="primary">Print QR Library</AdminActionButton>
              <AdminActionButton href="/admin/dashboard">Admin overview</AdminActionButton>
            </>
          }
        />
      </div>
      <ClaimToolsClient />
    </AdminPageShell>
  );
}
