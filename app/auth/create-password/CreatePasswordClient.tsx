"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PasswordStrengthMeter from "@/components/auth/PasswordStrengthMeter";
import { isStrongEnoughPassword } from "@/lib/auth/password-policy";

type ValidateResponse = { ok: boolean; status: "valid" | "missing" | "invalid" | "expired" | "used"; message?: string; expires_at_display?: string };

export default function CreatePasswordPage() {
  const params = useSearchParams();
  const token = params.get("token")?.trim() || "";
  const [status, setStatus] = useState<ValidateResponse>({ ok: false, status: "missing", message: "This password setup link is missing a token." });
  const [loading, setLoading] = useState(Boolean(token));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [requestEmail, setRequestEmail] = useState("");
  const [requestDone, setRequestDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch("/api/auth/create-password/validate-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then((res) => res.json())
      .then((data) => setStatus(data))
      .finally(() => setLoading(false));
  }, [token]);

  const ready = useMemo(() => status.ok && password === confirmPassword && isStrongEnoughPassword(password), [status.ok, password, confirmPassword]);

  const submit = async () => {
    setMessage("");
    const res = await fetch("/api/auth/create-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
    const data = await res.json();
    if (!res.ok) return setMessage(data.message || "Failed to create password.");
    window.location.href = "/login?message=Password%20created.%20You%20can%20now%20sign%20in.";
  };

  const requestNewLink = async () => {
    await fetch("/api/auth/create-password/request-new-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: requestEmail }) });
    setRequestDone(true);
  };

  return <main className="min-h-screen bg-[#090706] p-4 text-white"><div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-black/30 p-5"><h1 className="text-2xl font-black">Create your password</h1><p className="mt-2 text-sm text-white/70">Setup links expire after 2 hours for your security.</p>{loading ? <p className="mt-4">Loading password setup...</p> : status.ok ? <div><p className="mt-3 text-sm text-white/70">This setup link expires on {status.expires_at_display}.</p><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" className="mt-4 h-11 w-full rounded-xl border border-white/20 bg-white/5 px-3" /><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" className="mt-3 h-11 w-full rounded-xl border border-white/20 bg-white/5 px-3" /><PasswordStrengthMeter password={password} confirmPassword={confirmPassword} /><button disabled={!ready} onClick={submit} className="mt-4 w-full rounded-full bg-[#e1062a] px-4 py-3 font-bold disabled:opacity-40">Create Password</button>{message && <p className="mt-3 text-sm text-rose-300">{message}</p>}</div> : <div className="mt-4"><p className="text-sm text-rose-300">{status.message || "This setup link is invalid or no longer active."}</p><h2 className="mt-5 text-xl font-black">Need a new setup link?</h2><p className="mt-2 text-sm text-white/70">Enter the email address connected to your TheOutHaven account and we’ll send a fresh password setup link if the account exists.</p><label className="mt-3 block text-sm">Email address</label><input value={requestEmail} onChange={(e) => setRequestEmail(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/20 bg-white/5 px-3" /><button onClick={requestNewLink} className="mt-4 w-full rounded-full bg-[#e1062a] px-4 py-3 font-bold">Request New Setup Link</button>{requestDone && <p className="mt-3 text-sm text-emerald-300">If an account exists for that email, we sent a new setup link. Please check your inbox.</p>}</div>}</div></main>;
}
