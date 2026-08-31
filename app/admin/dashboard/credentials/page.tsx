import { requireAdminRole } from "@/lib/admin-auth";
import CredentialsVaultClient from "../settings/credentials/CredentialsVaultClient";

export const dynamic = "force-dynamic";

export default async function CredentialsVaultPage() {
  await requireAdminRole(["superadmin"]);

  return (
    <main className="admin-page min-h-screen bg-[#090706] px-4 pb-12 pt-24 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">System</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Credentials Vault</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65 sm:text-base">
            Manage TheOutHaven integration credentials from one protected admin page. Secret values are stored in AWS Secrets Manager and are never returned to the browser after saving.
          </p>
        </div>
        <CredentialsVaultClient />
      </div>
    </main>
  );
}
