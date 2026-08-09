import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { getUserOrganizationContext } from "@/lib/organizations/context";
import BusinessOrganizationForm from "./BusinessOrganizationForm";

export const dynamic = "force-dynamic";

export default async function BusinessOnboardingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/business/onboarding")}`);
  }

  const context = await getUserOrganizationContext(user.id);
  if (context.organizations.length) {
    redirect("/business/dashboard");
  }

  return (
    <main className="min-h-screen bg-[#050505] px-4 py-12 text-white sm:px-6">
      <div className="mx-auto max-w-xl">
        <div className="mb-8">
          <Link href="/" className="text-sm font-bold text-white/55 hover:text-white">
            ← TheOutHaven
          </Link>
          <p className="mt-8 text-xs font-black uppercase tracking-[0.22em] text-[#ec0b5b]">
            TheOutHaven for Business
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            Create your organization
          </h1>
          <p className="mt-3 text-white/60">
            Your organization is the workspace for locations, events, team members, reservations,
            ticketing, customers, analytics, and future payouts. You do not need to own a location
            to create one.
          </p>
        </div>

        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-7">
          <BusinessOrganizationForm />
        </section>
      </div>
    </main>
  );
}
