"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

type Tab = "signin" | "signup";

type AccountType = "user" | "business_owner";

type SignupState = {
  full_name: string;
  email: string;
  password: string;
  confirm_password: string;
  city: string;
  state: string;
  age_range: string;
  mobile_number: string;
  gender: string;
  relationship_status: string;
  favorite_cuisines: string;
  favorite_activities: string;
  budget_range: string;
  preferred_area: string;
  outing_style: string;
  account_type: AccountType;
};

const initialSignupState: SignupState = {
  full_name: "",
  email: "",
  password: "",
  confirm_password: "",
  city: "",
  state: "",
  age_range: "",
  mobile_number: "",
  gender: "",
  relationship_status: "",
  favorite_cuisines: "",
  favorite_activities: "",
  budget_range: "",
  preferred_area: "",
  outing_style: "",
  account_type: "user",
};

function parseCommaSeparatedList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function LoginPage({ initialTab = "signin" }: { initialTab?: Tab }) {
  const supabase = createClient();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [signin, setSignin] = useState({ email: "", password: "" });
  const [signup, setSignup] = useState<SignupState>(initialSignupState);

  const continueWithGoogle = async () => {
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (authError) setError(authError.message);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: signin.email.trim().toLowerCase(),
        password: signin.password,
      });
      if (loginError) return setError(loginError.message);
      const userEmail = data.user?.email?.toLowerCase();
      if (!userEmail) return setError("Login failed. Please try again.");

      const { data: adminUser } = await supabase
        .from("admin_users")
        .select("role")
        .eq("email", userEmail)
        .maybeSingle();

      const metadataRole = data.user.user_metadata?.role;
      const role = adminUser?.role || metadataRole;
      const roleRedirects: Record<string, string> = {
        superuser: "/admin/dashboard",
        admin: "/admin/dashboard",
        editor: "/admin/restaurants",
        reviewer: "/admin/claims",
        viewer: "/admin/dashboard/import",
      };
      setMessage("Login successful. Redirecting...");
      router.replace(role ? roleRedirects[role] || "/admin/dashboard" : "/create");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    const requiredFields: Array<keyof SignupState> = [
      "full_name",
      "email",
      "password",
      "confirm_password",
      "city",
      "state",
      "age_range",
    ];

    for (const field of requiredFields) {
      if (!signup[field]?.trim()) {
        setError("Please complete all required fields.");
        return;
      }
    }

    if (signup.password !== signup.confirm_password) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const userEmail = signup.email.trim().toLowerCase();

    try {
      const { data: signupData, error: signupError } = await supabase.auth.signUp({
        email: userEmail,
        password: signup.password,
        options: {
          data: {
            role: signup.account_type === "business_owner" ? "location_owner" : "user",
            full_name: signup.full_name.trim(),
            account_type: signup.account_type,
          },
        },
      });

      if (signupError) {
        setError(signupError.message);
        return;
      }

      const userId = signupData.user?.id;
      if (!userId) {
        setError("Signup succeeded, but we could not create your profile. Please try again.");
        return;
      }

      const profilePayload = {
        id: userId,
        full_name: signup.full_name.trim(),
        mobile_number: signup.mobile_number.trim() || null,
        city: signup.city.trim(),
        state: signup.state.trim(),
        age_range: signup.age_range.trim(),
        gender: signup.gender.trim() || null,
        relationship_status: signup.relationship_status.trim() || null,
        favorite_cuisines: parseCommaSeparatedList(signup.favorite_cuisines),
        favorite_activities: parseCommaSeparatedList(signup.favorite_activities),
        budget_range: signup.budget_range.trim() || null,
        preferred_area: signup.preferred_area.trim() || null,
        outing_style: signup.outing_style.trim() || null,
        account_type: signup.account_type,
      };

      const { error: profileError } = await supabase.from("user_profiles").upsert(profilePayload, {
        onConflict: "id",
      });

      if (profileError) {
        setError(profileError.message);
        return;
      }

      setMessage("Account created. Redirecting...");
      router.replace("/create");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-10 lg:py-10">
      <section className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-7xl gap-6 lg:grid-cols-[1.02fr_0.98fr]">
        <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_22%_20%,rgba(190,24,93,.23),transparent_38%),radial-gradient(circle_at_80%_0%,rgba(250,204,21,.12),transparent_30%),linear-gradient(160deg,#120d0b,#1b1210_45%,#090706)] p-7 shadow-2xl lg:p-10">
          <p className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs tracking-[0.22em] text-white/60">THEOUTHAVEN</p>
          <h1 className="mt-8 text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">Plan better nights out. Discover better places.</h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-white/60 sm:text-base">
            TheOutHaven helps you discover restaurants, activities, and curated outing ideas while giving businesses tools to claim and manage their profiles.
          </p>
          <div className="mt-8 space-y-3">
            {[
              "Curated restaurants and activities",
              "Personalized outing recommendations",
              "Business owner claim access",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-rose-600 to-amber-300" />
                <span className="text-sm text-white/80">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center">
          <div className="w-full rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur-xl sm:p-7">
            <div className="mb-6 flex rounded-full border border-white/10 bg-black/40 p-1">
              <button onClick={() => setTab("signin")} className={`flex-1 rounded-full px-4 py-2 text-sm font-medium ${tab === "signin" ? "bg-gradient-to-r from-rose-700 to-amber-400 text-white" : "text-white/60"}`}>Sign In</button>
              <button onClick={() => setTab("signup")} className={`flex-1 rounded-full px-4 py-2 text-sm font-medium ${tab === "signup" ? "bg-gradient-to-r from-rose-700 to-amber-400 text-white" : "text-white/60"}`}>Create Account</button>
            </div>

            {error && <p className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm">{error}</p>}
            {message && <p className="mb-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">{message}</p>}

            {tab === "signin" ? (
              <form onSubmit={handleSignIn} className="space-y-3">
                <input type="email" placeholder="Email" value={signin.email} onChange={(e) => setSignin((s) => ({ ...s, email: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 text-sm" />
                <input type="password" placeholder="Password" value={signin.password} onChange={(e) => setSignin((s) => ({ ...s, password: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 text-sm" />
                <button disabled={loading} className="w-full rounded-xl bg-gradient-to-r from-rose-700 to-amber-500 px-4 py-3 font-bold">{loading ? "Signing In..." : "Sign In"}</button>
              </form>
            ) : (
              <form onSubmit={handleCreateAccount} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input required placeholder="Full name" value={signup.full_name} onChange={(e) => setSignup((s) => ({ ...s, full_name: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 text-sm sm:col-span-2" />
                <input required type="email" placeholder="Email" value={signup.email} onChange={(e) => setSignup((s) => ({ ...s, email: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 text-sm sm:col-span-2" />
                <input required type="password" placeholder="Password" value={signup.password} onChange={(e) => setSignup((s) => ({ ...s, password: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 text-sm" />
                <input required type="password" placeholder="Confirm password" value={signup.confirm_password} onChange={(e) => setSignup((s) => ({ ...s, confirm_password: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 text-sm" />
                <input required placeholder="City" value={signup.city} onChange={(e) => setSignup((s) => ({ ...s, city: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 text-sm" />
                <input required placeholder="State" value={signup.state} onChange={(e) => setSignup((s) => ({ ...s, state: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 text-sm" />
                <input required placeholder="Age range" value={signup.age_range} onChange={(e) => setSignup((s) => ({ ...s, age_range: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 text-sm" />
                <input placeholder="Mobile number" value={signup.mobile_number} onChange={(e) => setSignup((s) => ({ ...s, mobile_number: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 text-sm" />
                <input placeholder="Gender" value={signup.gender} onChange={(e) => setSignup((s) => ({ ...s, gender: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 text-sm" />
                <input placeholder="Relationship status" value={signup.relationship_status} onChange={(e) => setSignup((s) => ({ ...s, relationship_status: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 text-sm" />
                <input placeholder="Favorite cuisines (comma separated)" value={signup.favorite_cuisines} onChange={(e) => setSignup((s) => ({ ...s, favorite_cuisines: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 text-sm" />
                <input placeholder="Favorite activities (comma separated)" value={signup.favorite_activities} onChange={(e) => setSignup((s) => ({ ...s, favorite_activities: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 text-sm" />
                <input placeholder="Budget range" value={signup.budget_range} onChange={(e) => setSignup((s) => ({ ...s, budget_range: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 text-sm" />
                <input placeholder="Preferred area" value={signup.preferred_area} onChange={(e) => setSignup((s) => ({ ...s, preferred_area: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 text-sm" />
                <input placeholder="Outing style" value={signup.outing_style} onChange={(e) => setSignup((s) => ({ ...s, outing_style: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 text-sm" />
                <select value={signup.account_type} onChange={(e) => setSignup((s) => ({ ...s, account_type: e.target.value as AccountType }))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 text-sm sm:col-span-2">
                  <option value="user">User</option>
                  <option value="business_owner">Business Owner</option>
                </select>
                <button disabled={loading} className="w-full rounded-xl bg-gradient-to-r from-rose-700 to-amber-500 px-4 py-3 font-bold sm:col-span-2">{loading ? "Creating..." : "Create Account"}</button>
              </form>
            )}

            <button onClick={continueWithGoogle} className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white">Continue with Google</button>
            <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-white/60"><Link href="/forgot-password">Forgot password?</Link><span><Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link></span></div>
          </div>
        </div>
      </section>
    </main>
  );
}
