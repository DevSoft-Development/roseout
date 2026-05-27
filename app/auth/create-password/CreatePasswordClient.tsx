"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PasswordStrengthMeter from "@/components/auth/PasswordStrengthMeter";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { isStrongEnoughPassword } from "@/lib/auth/password-policy";

export default function CreatePasswordPage() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const siteKeyConfigured = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const ready = useMemo(
    () =>
      !!token &&
      password === confirmPassword &&
      isStrongEnoughPassword(password) &&
      !!captchaToken &&
      siteKeyConfigured,
    [token, password, confirmPassword, captchaToken, siteKeyConfigured],
  );

  const submit = async () => {
    setLoading(true);
    const res = await fetch("/api/auth/create-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password, captchaToken }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setCaptchaToken(null);
      return setMessage(data.error || "Failed to create password.");
    }
    window.location.href = "/login?message=Password%20created.%20You%20can%20now%20sign%20in.";
  };

  return <main className="min-h-screen bg-[#090706] p-4 text-white"><div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-black/30 p-5"><h1 className="text-2xl font-black">Create your password</h1><p className="mt-2 text-sm text-white/70">Use a strong password with at least 8 characters.</p><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="New password" className="mt-4 h-11 w-full rounded-xl border border-white/20 bg-white/5 px-3"/><input type="password" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} placeholder="Confirm password" className="mt-3 h-11 w-full rounded-xl border border-white/20 bg-white/5 px-3"/><PasswordStrengthMeter password={password} confirmPassword={confirmPassword}/><TurnstileWidget onTokenChange={setCaptchaToken} />{!siteKeyConfigured && <p className="mt-2 text-xs text-amber-300">Turnstile site key is not configured.</p>}<button disabled={!ready||loading} onClick={submit} className="mt-4 w-full rounded-full bg-rose-600 px-4 py-3 font-bold disabled:opacity-40">{loading?"Saving...":"Create Password"}</button>{message && <p className="mt-3 text-sm text-rose-300">{message}</p>}</div></main>;
}
