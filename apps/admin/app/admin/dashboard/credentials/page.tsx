import { KeyRound } from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import CredentialsVaultClient from "./CredentialsVaultClient";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export default async function CredentialsVaultPage() {
  await requireAdminRole(["superadmin"]);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="System · Secrets"
        title="Credentials Vault"
        subtitle="Centralize TheOutHaven integration credentials in AWS Secrets Manager, migrate existing runtime secrets without exposing values, and identify credentials that remain role-managed or require one-time re-entry."
        badge={<AdminStatusBadge tone="green"><KeyRound className="mr-1 h-3.5 w-3.5" />Superadmin protected</AdminStatusBadge>}
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/security">Security</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/settings">Settings</AdminActionButton>
          </>
        }
      />
      <CredentialsVaultClient />
    </AdminPageShell>
  );
}
