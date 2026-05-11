import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase-server";
import ActivityTracker from "@/components/ActivityTracker";
import TrackedButton from "@/components/TrackedButton";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import AccountProfileForm from "@/components/AccountProfileForm";

export const dynamic = "force-dynamic";

type SavedPlan = {
  id: string;
  title?: string | null;
  summary?: string | null;
  created_at?: string | null;
};

type UserProfile = {
  id?: string;
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
  username?: string | null;
  bio?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  role?: string | null;
  subscription_status?: string | null;
  created_at?: string | null;
};

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
      },
    }
  );
}

export default async function UserDashboardPage() {
  const cookieStore = await cookies();

  const impersonatedUserId = cookieStore.get(
    "theouthaven_impersonate_user_id"
  )?.value;

  const sessionSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await sessionSupabase.auth.getUser();

  const supabase = adminSupabase();

  const userId = impersonatedUserId || user?.id || null;

  if (!userId) {
    redirect("/login");
  }

  const { data: profileData } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  const profile: UserProfile =
    profileData ||
    (user
      ? {
          id: user.id,
          email: user.email,
          full_name:
            (user.user_metadata?.full_name as string | undefined) || null,
          phone: (user.user_metadata?.phone as string | undefined) || null,
          username: (user.user_metadata?.username as string | undefined) || null,
          bio: (user.user_metadata?.bio as string | undefined) || null,
          address: (user.user_metadata?.address as string | undefined) || null,
          city: (user.user_metadata?.city as string | undefined) || null,
          state: (user.user_metadata?.state as string | undefined) || null,
          zip_code: (user.user_metadata?.zip_code as string | undefined) || null,
          role: (user.user_metadata?.role as string | undefined) || "user",
          subscription_status: "free",
          created_at: user.created_at,
        }
      : {});

  const { data: savedPlans } = await supabase
    .from("saved_plans")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(6);

  const totalSavedPlans = savedPlans?.length || 0;

  return (
    <main className="min-h-screen bg-[#080407] text-white">
      <ActivityTracker userId={userId} />
      <TheOutHavenHeader />

      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.28),transparent_34%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.18),transparent_30%)]" />

        <div className="relative mx-auto max-w-7xl px-6 py-12">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">
                TheOutHaven Portal
              </p>

              <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">
                Welcome back,
                <span className="block text-rose-200">
                  {profile.full_name || "TheOutHaven User"}
                </span>
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/55 md:text-base">
                View your saved outings, manage your account, and create your
                next curated date night experience.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <TrackedButton
                href="/create"
                eventType="button_click"
                eventName="Create New Outing Clicked"
                metadata={{ source: "user_dashboard_hero" }}
                className="rounded-full bg-rose-500 px-6 py-3 text-center text-sm font-black text-white shadow-lg shadow-rose-500/25 transition hover:bg-rose-400"
              >
                Create New Outing
              </TrackedButton>

              <TrackedButton
                href="/support"
                eventType="button_click"
                eventName="Support Tickets Clicked"
                metadata={{ source: "user_dashboard_hero" }}
                className="rounded-full border border-white/15 bg-white/[0.06] px-6 py-3 text-center text-sm font-black text-white transition hover:bg-white hover:text-black"
              >
                Support Tickets
              </TrackedButton>

              <TrackedButton
                href="/user/account"
                eventType="button_click"
                eventName="Edit Account Clicked"
                metadata={{ source: "user_dashboard_hero" }}
                className="rounded-full border border-white/15 bg-white/[0.06] px-6 py-3 text-center text-sm font-black text-white transition hover:bg-white hover:text-black"
              >
                Edit Account
              </TrackedButton>

              <TrackedButton
                href="/user/saved"
                eventType="button_click"
                eventName="View Saved Plans Clicked"
                metadata={{ source: "user_dashboard_hero" }}
                className="rounded-full border border-white/15 bg-white/[0.06] px-6 py-3 text-center text-sm font-black text-white transition hover:bg-white hover:text-black"
              >
                View Saved Plans
              </TrackedButton>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/20">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/35">
              Saved Plans
            </p>
            <h2 className="mt-3 text-4xl font-black">{totalSavedPlans}</h2>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/20">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/35">
              Status
            </p>
            <h2 className="mt-3 text-3xl font-black capitalize">
              {profile.subscription_status || "free"}
            </h2>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/20">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/35">
              Role
            </p>
            <h2 className="mt-3 text-3xl font-black capitalize">
              {profile.role || "user"}
            </h2>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/20">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/35">
              Member Since
            </p>
            <h2 className="mt-3 text-lg font-black">
              {profile.created_at
                ? new Date(profile.created_at).toLocaleDateString()
                : "New"}
            </h2>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/25 lg:col-span-2">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-300">
                  Recent Activity
                </p>
                <h2 className="mt-2 text-2xl font-black">Saved Plans</h2>
              </div>

              <TrackedButton
                href="/support"
                eventType="button_click"
                eventName="Support Tickets Clicked"
                metadata={{ source: "user_dashboard_hero" }}
                className="rounded-full border border-white/15 bg-white/[0.06] px-6 py-3 text-center text-sm font-black text-white transition hover:bg-white hover:text-black"
              >
                Support Tickets
              </TrackedButton>

              <TrackedButton
                href="/user/saved"
                eventType="button_click"
                eventName="View All Saved Plans Clicked"
                metadata={{ source: "saved_plans_section" }}
                className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/70 transition hover:bg-white hover:text-black"
              >
                View All
              </TrackedButton>
            </div>

            {!savedPlans || savedPlans.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-white/15 bg-black/25 p-10 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/15 text-2xl">
                  🌹
                </div>

                <h3 className="mt-5 text-2xl font-black">
                  No saved plans yet
                </h3>

                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/45">
                  Start with a restaurant, activity, or full date-night plan.
                  Your saved TheOutHaven results will show here.
                </p>

                <TrackedButton
                  href="/create"
                  eventType="button_click"
                  eventName="Start Planning Empty State Clicked"
                  metadata={{ source: "empty_saved_plans_state" }}
                  className="mt-6 inline-flex rounded-full bg-rose-500 px-6 py-3 text-sm font-black text-white transition hover:bg-rose-400"
                >
                  Start Planning
                </TrackedButton>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {(savedPlans as SavedPlan[]).map((plan) => (
                  <div
                    key={plan.id}
                    className="group rounded-[1.5rem] border border-white/10 bg-black/25 p-5 transition hover:border-rose-400/40 hover:bg-rose-500/10"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-300">
                          Saved Outing
                        </p>

                        <h3 className="mt-3 line-clamp-2 text-xl font-black">
                          {plan.title || "TheOutHaven Plan"}
                        </h3>
                      </div>

                      <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase text-white/60">
                        Plan
                      </span>
                    </div>

                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-white/50">
                      {plan.summary || "Your saved TheOutHaven outing plan."}
                    </p>

                    <div className="mt-5 flex items-center justify-between gap-3">
                      <p className="text-xs text-white/30">
                        {plan.created_at
                          ? new Date(plan.created_at).toLocaleDateString()
                          : ""}
                      </p>

                      <TrackedButton
                        href={`/user/saved/${plan.id}`}
                        eventType="plan_click"
                        eventName="View Saved Plan Clicked"
                        metadata={{
                          plan_id: plan.id,
                          plan_title: plan.title || "TheOutHaven Plan",
                          source: "user_dashboard_saved_plan_card",
                        }}
                        className="rounded-full bg-white px-4 py-2 text-xs font-black text-black transition hover:bg-rose-100"
                      >
                        View Plan
                      </TrackedButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-6">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/25">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-300">
                Account
              </p>

              <h2 className="mt-2 text-2xl font-black">Profile Details</h2>

              <AccountProfileForm
                fullName={profile.full_name}
                email={profile.email}
                phone={profile.phone}
                username={profile.username}
                bio={profile.bio}
                address={profile.address}
                city={profile.city}
                state={profile.state}
                zipCode={profile.zip_code}
                compact
              />
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/25">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-300">
                Support
              </p>

              <h2 className="mt-2 text-2xl font-black">Need help?</h2>

              <p className="mt-3 text-sm leading-6 text-white/55">
                Submit a ticket, view your private ticket link, or reply to an
                open TheOutHaven support conversation.
              </p>

              <Link
                href="/support"
                className="mt-5 inline-flex w-full justify-center rounded-full border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-black text-white transition hover:bg-white hover:text-black"
              >
                Open Support Tickets
              </Link>
            </div>

            <div className="rounded-[2rem] border border-rose-400/20 bg-gradient-to-br from-rose-500/20 via-fuchsia-500/10 to-white/[0.04] p-6 shadow-2xl shadow-black/25">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200">
                Next Outing
              </p>

              <h2 className="mt-2 text-2xl font-black">
                Make the night feel effortless.
              </h2>

              <p className="mt-3 text-sm leading-6 text-white/55">
                Tell TheOutHaven what mood, borough, budget, and vibe you want. Get
                a polished plan in seconds.
              </p>

              <TrackedButton
                href="/create"
                eventType="button_click"
                eventName="Create Plan CTA Clicked"
                metadata={{ source: "user_dashboard_next_outing_card" }}
                className="mt-5 inline-flex w-full justify-center rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-rose-100"
              >
                Create Plan
              </TrackedButton>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}