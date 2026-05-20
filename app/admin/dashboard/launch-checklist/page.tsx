import { requireAdminRole } from "@/lib/admin-auth";

export const metadata = {
  title: "Launch Checklist – Admin",
  description: "Production launch readiness checklist for TheOutHaven.",
};

const checks = [
  "build status",
  "Stripe test status",
  "email status",
  "SMS status",
  "reservation status",
  "review system status",
  "SEO status",
  "mobile QA status",
];

export default async function LaunchChecklistPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);

  return (
    <main className="min-h-screen bg-[#090706] p-6 text-white">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-black">Launch Checklist</h1>
        <p className="mt-2 text-white/60">Track and confirm all launch-readiness gates.</p>
        <div className="mt-6 space-y-3">
          {checks.map((item) => (
            <div key={item} className="rounded-xl border border-white/15 bg-white/5 p-4">
              <p className="font-bold capitalize">{item}</p>
              <p className="text-sm text-white/60">Status: pending verification</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
