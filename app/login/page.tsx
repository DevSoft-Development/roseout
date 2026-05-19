"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

type Tab = "signin" | "signup";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [signin, setSignin] = useState({ email: "", password: "" });
  const [signup, setSignup] = useState({
    full_name: "",
    email: "",
    password: "",
    confirm_password: "",
    account_type: "user",
  });

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
    if (signup.password !== signup.confirm_password) return setError("Passwords do not match.");
    setLoading(true);
    const userEmail = signup.email.trim().toLowerCase();
    const { error: signupError } = await supabase.auth.signInWithOtp({
      email: userEmail,
      options: {
        shouldCreateUser: true,
        data: {
          role: signup.account_type === "business_owner" ? "location_owner" : "user",
          full_name: signup.full_name,
          account_type: signup.account_type,
        },
      },
    });
    if (signupError) {
      setError(signupError.message);
      setLoading(false);
      return;
    }
    sessionStorage.setItem("theouthaven_pending_signup", JSON.stringify({ email: userEmail, password: signup.password }));
    window.location.href = `/verify?email=${encodeURIComponent(userEmail)}`;
  };

  return (
    <main className="min-h-screen bg-[#090706] text-white">
      <section className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <div className="hidden border-r border-white/10 bg-[radial-gradient(circle_at_20%_20%,rgba(190,24,93,.2),transparent_35%),linear-gradient(160deg,#120d0b,#090706)] p-10 lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs tracking-[0.22em] text-white/60">THEOUTHAVEN</p>
            <h1 className="mt-8 text-6xl font-black leading-[0.95]">Luxury nights.<br />Concierge vibes.</h1>
            <p className="mt-4 max-w-lg text-white/60">Discover elevated date nights, social scenes, and curated reservations tailored to your taste.</p>
          </div>
          <p className="text-sm text-white/60">Private by design • Premium by default</p>
        </div>

        <div className="flex items-center justify-center px-5 py-8">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
            <div className="mb-6 flex rounded-full border border-white/10 bg-black/40 p-1">
              <button onClick={() => setTab("signin")} className={`flex-1 rounded-full px-4 py-2 text-sm ${tab === "signin" ? "bg-gradient-to-r from-rose-700 to-amber-400 text-white" : "text-white/60"}`}>Sign In</button>
              <button onClick={() => setTab("signup")} className={`flex-1 rounded-full px-4 py-2 text-sm ${tab === "signup" ? "bg-gradient-to-r from-rose-700 to-amber-400 text-white" : "text-white/60"}`}>Create Account</button>
            </div>
            {error && <p className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm">{error}</p>}
            {message && <p className="mb-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">{message}</p>}

            {tab === "signin" ? (
              <form onSubmit={handleSignIn} className="space-y-3">
                <input type="email" placeholder="Email" value={signin.email} onChange={(e) => setSignin((s) => ({ ...s, email: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3" />
                <input type="password" placeholder="Password" value={signin.password} onChange={(e) => setSignin((s) => ({ ...s, password: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3" />
                <button disabled={loading} className="w-full rounded-xl bg-gradient-to-r from-rose-700 to-amber-500 px-4 py-3 font-bold">{loading ? "Signing In..." : "Sign In"}</button>
              </form>
            ) : (
              <form onSubmit={handleCreateAccount} className="space-y-3">
                <input placeholder="Full Name" value={signup.full_name} onChange={(e)=>setSignup((s)=>({...s,full_name:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3" />
                <input type="email" placeholder="Email" value={signup.email} onChange={(e)=>setSignup((s)=>({...s,email:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3" />
                <input type="password" placeholder="Password" value={signup.password} onChange={(e)=>setSignup((s)=>({...s,password:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3" />
                <input type="password" placeholder="Confirm Password" value={signup.confirm_password} onChange={(e)=>setSignup((s)=>({...s,confirm_password:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3" />
                <select value={signup.account_type} onChange={(e)=>setSignup((s)=>({...s,account_type:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3">
                  <option value="user">User</option><option value="business_owner">Business Owner</option>
                </select>
                <button disabled={loading} className="w-full rounded-xl bg-gradient-to-r from-rose-700 to-amber-500 px-4 py-3 font-bold">{loading ? "Creating..." : "Create Account"}</button>
              </form>
            )}

            <button onClick={continueWithGoogle} className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white">Continue with Google</button>
            <div className="mt-4 flex justify-between text-xs text-white/60"><Link href="/forgot-password">Forgot password?</Link><span><Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link></span></div>
          </div>
        </div>
      </section>
    </main>
  );
}
