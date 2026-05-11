import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase-server";
import AccountProfileForm from "@/components/AccountProfileForm";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import TrackedButton from "@/components/TrackedButton";

export const dynamic = "force-dynamic";

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

export default async function UserAccountPage() {
  const sessionSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await sessionSupabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = adminSupabase();
  const { data: profileData } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const profile: UserProfile =
    profileData ||
    {
      id: user.id,
      email: user.email,
      full_name: (user.user_metadata?.full_name as string | undefined) || null,
      phone: (user.user_metadata?.phone as string | undefined) || null,
      username: (user.user_metadata?.username as string | undefined) || null,
      bio: (user.user_metadata?.bio as string | undefined) || null,
      address: (user.user_metadata?.address as string | undefined) || null,
      city: (user.user_metadata?.city as string | undefined) || null,
      state: (user.user_metadata?.state as string | undefined) || null,
      zip_code: (user.user_metadata?.zip_code as string | undefined) || null,
    };

  return (
    <main className="min-h-screen bg-[#080407] text-white">
      <TheOutHavenHeader />

      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.28),transparent_34%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.18),transparent_30%)]" />

        <div className="relative mx-auto max-w-5xl px-6 py-12">
          <TrackedButton
            href="/user/dashboard"
            eventType="button_click"
            eventName="Back To Dashboard Clicked"
            metadata={{ source: "user_account" }}
            className="inline-flex rounded-full border border-white/15 bg-white/[0.06] px-5 py-2.5 text-sm font-black text-white transition hover:bg-white hover:text-black"
          >
            ← Back to dashboard
          </TrackedButton>

          <p className="mt-8 text-xs font-black uppercase tracking-[0.35em] text-rose-300">
            Account Settings
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">
            Edit your profile
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/55 md:text-base">
            Update all of your account details in one place. Your email stays
            locked to protect login and account recovery.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/25 md:p-8">
          <AccountProfileForm
            fullName={profile.full_name}
            email={profile.email || user.email}
            phone={profile.phone}
            username={profile.username}
            bio={profile.bio}
            address={profile.address}
            city={profile.city}
            state={profile.state}
            zipCode={profile.zip_code}
          />
        </div>
      </section>
    </main>
  );
}
