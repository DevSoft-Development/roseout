"use client";

import { useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { createClient } from "@/lib/supabase-browser";

export default function SignupPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ full_name:"", email:"", password:"", confirm_password:"", mobile_number:"", city:"", state:"", age_range:"", gender:"", relationship_status:"", favorite_cuisines:"", favorite_activities:"", budget_range:"", preferred_area:"", outing_style:"" });
  const update=(k:string,v:string)=>setForm((s)=>({...s,[k]:v}));

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm_password) return setError("Passwords do not match.");
    setLoading(true);
    const email = form.email.trim().toLowerCase();
    const { error: signupError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, data: { full_name: form.full_name, role: "user", city: form.city, state: form.state } },
    });
    if (signupError) { setError(signupError.message); setLoading(false); return; }

    sessionStorage.setItem("theouthaven_pending_signup", JSON.stringify({ email, password: form.password, profile: { ...form, favorite_cuisines: form.favorite_cuisines.split(",").map((v)=>v.trim()).filter(Boolean), favorite_activities: form.favorite_activities.split(",").map((v)=>v.trim()).filter(Boolean) } }));
    window.location.href = `/verify?email=${encodeURIComponent(email)}`;
  };

  return <main className="min-h-screen bg-[#090706] text-white"><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer />
  <section className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]"><div className="hidden border-r border-white/10 bg-[radial-gradient(circle_at_20%_20%,rgba(190,24,93,.2),transparent_35%),linear-gradient(160deg,#120d0b,#090706)] p-10 lg:block"><p className="text-white/60">THEOUTHAVEN</p><h1 className="mt-6 text-6xl font-black leading-[0.95]">Your concierge<br/>account awaits.</h1></div>
  <div className="flex items-center justify-center p-4"><form onSubmit={handleSignup} className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl"><h2 className="mb-4 text-3xl font-black">Create Account</h2>{error&&<p className="mb-3 text-rose-300">{error}</p>}<div className="grid gap-3 sm:grid-cols-2">
  <input required placeholder="Full name" value={form.full_name} onChange={(e)=>update("full_name",e.target.value)} className="rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 sm:col-span-2"/>
  <input required type="email" placeholder="Email" value={form.email} onChange={(e)=>update("email",e.target.value)} className="rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 sm:col-span-2"/>
  <input required type="password" placeholder="Password" value={form.password} onChange={(e)=>update("password",e.target.value)} className="rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3"/>
  <input required type="password" placeholder="Confirm password" value={form.confirm_password} onChange={(e)=>update("confirm_password",e.target.value)} className="rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3"/>
  <input placeholder="Mobile number" value={form.mobile_number} onChange={(e)=>update("mobile_number",e.target.value)} className="rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3"/>
  <select required value={form.age_range} onChange={(e)=>update("age_range",e.target.value)} className="rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3"><option value="">Age range</option><option>18-24</option><option>25-34</option><option>35-44</option><option>45-54</option><option>55+</option></select>
  <input required placeholder="City" value={form.city} onChange={(e)=>update("city",e.target.value)} className="rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3"/>
  <input required placeholder="State" value={form.state} onChange={(e)=>update("state",e.target.value)} className="rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3"/>
  <input placeholder="Gender (optional)" value={form.gender} onChange={(e)=>update("gender",e.target.value)} className="rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3"/>
  <input placeholder="Relationship status (optional)" value={form.relationship_status} onChange={(e)=>update("relationship_status",e.target.value)} className="rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3"/>
  <input placeholder="Favorite cuisines (comma-separated)" value={form.favorite_cuisines} onChange={(e)=>update("favorite_cuisines",e.target.value)} className="rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 sm:col-span-2"/>
  <input placeholder="Favorite activities (comma-separated)" value={form.favorite_activities} onChange={(e)=>update("favorite_activities",e.target.value)} className="rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 sm:col-span-2"/>
  <input placeholder="Budget range" value={form.budget_range} onChange={(e)=>update("budget_range",e.target.value)} className="rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3"/>
  <input placeholder="Preferred area" value={form.preferred_area} onChange={(e)=>update("preferred_area",e.target.value)} className="rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3"/>
  <input placeholder="Outing style" value={form.outing_style} onChange={(e)=>update("outing_style",e.target.value)} className="rounded-xl border border-white/10 bg-[#120d0b] px-4 py-3 sm:col-span-2"/>
  </div><button disabled={loading} className="mt-4 w-full rounded-xl bg-gradient-to-r from-rose-700 to-amber-500 px-4 py-3 font-bold">{loading?"Creating...":"Create Account"}</button><p className="mt-3 text-center text-sm text-white/60">By continuing you agree to <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy</Link>.</p></form></div></section></main>;
}
