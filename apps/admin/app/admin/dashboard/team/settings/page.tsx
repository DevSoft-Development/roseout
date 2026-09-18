import { requireAdminRole } from "@theouthaven/auth/admin-session";

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  await requireAdminRole(["superadmin", "admin", "manager"]);

  return (
    <main className="px-4 py-6 text-white">
      <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-[#111] p-6">
        <h1 className="text-3xl font-black">Team Tools Settings</h1>
        <p className="mt-3 text-sm font-bold leading-6 text-white/55">
          Workspace behavior is controlled by team member profile permissions,
          allowed work types, do-not-contact fields, automation configuration,
          and manager review routes. Use Team Members to update per-user
          settings.
        </p>
      </div>
    </main>
  );
}
