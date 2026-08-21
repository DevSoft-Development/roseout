"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import ClientTurnstile from "@/components/security/ClientTurnstile";
import { normalizeClaimCode } from "@/lib/claimQr";
import { createClient } from "@/lib/supabase-browser";
import { formatFullAddress } from "@/lib/address-utils";

type ClaimLocation = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  borough?: string | null;
  state?: string | null;
  zipCode?: string | null;
  locationType?: string | null;
  primaryCategory?: string | null;
  phone?: string | null;
  website?: string | null;
  claimStatus?: string | null;
  photo?: string | null;
  missingItems: string[];
  attentionCount: number;
  profileStrength: number;
};

type Stage = "loading" | "location" | "contact" | "otp" | "submitted" | "linked";
type Channel = "email" | "sms";

const inputClass = "w-full rounded-2xl border border-white/10 bg-[#0d0d0d] px-4 py-4 text-base font-bold text-white outline-none placeholder:text-white/30 focus:border-[#e1062a]";

function ClaimPageInner() {
  const searchParams = useSearchParams();
  const supabase = createClient();
  const codeFromUrl = normalizeClaimCode(searchParams.get("code") || "");
  const isAccountLinkReturn = searchParams.get("link") === "1";
  const [claimCode, setClaimCode] = useState(codeFromUrl);
  const [location, setLocation] = useState<ClaimLocation | null>(null);
  const [stage, setStage] = useState<Stage>(codeFromUrl ? "loading" : "location");
  const [channel, setChannel] = useState<Channel>("email");
  const [contact, setContact] = useState("");
  const [challengeId, setChallengeId] = useState(searchParams.get("challengeId") || "");
  const [maskedContact, setMaskedContact] = useState("");
  const [otp, setOtp] = useState("");
  const [claimRequestId, setClaimRequestId] = useState(searchParams.get("claimId") || "");
  const [contactMatch, setContactMatch] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accountMessage, setAccountMessage] = useState("");

  async function loadLocation(codeValue = claimCode, source: "qr" | "manual" = "manual") {
    const code = normalizeClaimCode(codeValue);
    setClaimCode(code);
    setError("");
    if (!code) {
      setStage("location");
      setError("Enter the claim code printed on your mailing label.");
      return;
    }

    setBusy(true);
    setStage("loading");
    try {
      const response = await fetch("/api/business/claim-code/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, source }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setLocation(null);
        setStage("location");
        setError(
          data.error === "location_claimed"
            ? "This business is already claimed. Contact support if you believe this is a mistake."
            : data.error === "used_code"
              ? "This claim code has already been used."
              : data.error === "expired_code"
                ? "This claim code has expired. Contact TheOutHaven for a new code."
                : "We could not verify that claim code.",
        );
        return;
      }
      setLocation(data.location);
      setStage("location");
    } catch {
      setStage("location");
      setError("We could not load this business right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (codeFromUrl && !isAccountLinkReturn) void loadLocation(codeFromUrl, "qr");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeFromUrl, isAccountLinkReturn]);

  useEffect(() => {
    if (!isAccountLinkReturn || !claimRequestId || !challengeId) return;

    let active = true;
    async function linkAccount() {
      setBusy(true);
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      if (!data.user) {
        setBusy(false);
        setError("Open the secure owner-access link from the verification email to finish linking your account.");
        return;
      }

      const response = await fetch("/api/business/claim-code/link-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimRequestId, challengeId }),
      });
      const result = await response.json();
      if (!active) return;
      setBusy(false);
      if (!response.ok || !result.ok) {
        setError("Your account is signed in, but we could not link it to this claim. Contact support with your claim reference.");
        return;
      }
      if (result.location) setLocation(result.location);
      setStage("linked");
      setAccountMessage(result.message || (result.approved ? "Your owner access is ready." : "Your owner account is linked while the claim finishes review."));
    }

    void linkAccount();
    return () => {
      active = false;
    };
  }, [challengeId, claimRequestId, isAccountLinkReturn, supabase]);

  async function requestOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!location) return;
    setError("");
    if (!contact.trim()) {
      setError(channel === "email" ? "Enter your business email." : "Enter your mobile number.");
      return;
    }
    if (!turnstileToken) {
      setError("Complete the quick security check first.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/business/claim-code/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: claimCode, channel, contact, turnstileToken }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setError(data.error === "rate_limited" ? "Too many verification attempts. Please try again later." : "We could not send the verification code.");
        setTurnstileToken("");
        setTurnstileResetKey((value) => value + 1);
        return;
      }
      setChallengeId(data.challengeId);
      setMaskedContact(data.maskedContact || "");
      setStage("otp");
      setOtp("");
    } catch {
      setError("We could not send the verification code.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtpAndClaim(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (otp.replace(/\D/g, "").length !== 6) {
      setError("Enter the 6-digit verification code.");
      return;
    }

    setBusy(true);
    try {
      const verifyResponse = await fetch("/api/business/claim-code/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, otp }),
      });
      const verification = await verifyResponse.json();
      if (!verifyResponse.ok || !verification.ok) {
        setError(
          verification.error === "otp_expired"
            ? "That code expired. Request a new verification code."
            : verification.error === "too_many_attempts"
              ? "Too many incorrect attempts. Request a new code."
              : "That verification code is not correct.",
        );
        return;
      }

      setContactMatch(Boolean(verification.contactMatch));
      const claimResponse = await fetch("/api/business/claim-code/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: claimCode, challengeId }),
      });
      const claim = await claimResponse.json();
      if (!claimResponse.ok || !claim.ok) {
        setError("Your contact was verified, but the claim could not be completed. Please try again.");
        return;
      }

      setClaimRequestId(claim.claimRequestId);
      setContactMatch(Boolean(claim.contactMatch));
      setStage("submitted");
    } catch {
      setError("We could not complete the claim right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function createOwnerAccess() {
    setError("");
    if (channel !== "email" || !contact.trim() || !claimRequestId || !challengeId) return;
    setBusy(true);
    try {
      const redirect = `${window.location.origin}/business/claim?code=${encodeURIComponent(claimCode)}&claimId=${encodeURIComponent(claimRequestId)}&challengeId=${encodeURIComponent(challengeId)}&link=1`;
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: contact.trim().toLowerCase(),
        options: {
          emailRedirectTo: redirect,
          shouldCreateUser: true,
          data: { account_type: "business_owner" },
        },
      });
      if (authError) throw authError;
      setAccountMessage("Check your email for the secure owner-access link. Your claim is already saved — no need to scan again.");
    } catch {
      setError("Your claim is saved, but we could not send the owner-access link. You can create your account later.");
    } finally {
      setBusy(false);
    }
  }

  const address = location
    ? formatFullAddress({
        address: location.address,
        city: location.city,
        state: location.state,
        zip: location.zipCode,
      })
    : "";

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <TheOutHavenHeader />
      <section className="mx-auto max-w-3xl px-4 pb-20 pt-24 sm:px-6 lg:pt-32">
        <div className="mb-6">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">Business owner claim</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Your TheOutHaven profile is ready to claim.</h1>
          <p className="mt-4 text-sm leading-7 text-white/60 sm:text-base">
            Control how your business appears when TheOutHaven recommends places to eat, drink, celebrate and go out.
          </p>
        </div>

        {stage === "loading" && (
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center text-sm font-bold text-white/60">Loading your business…</div>
        )}

        {!codeFromUrl && !location && stage === "location" && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void loadLocation(claimCode, "manual");
            }}
            className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6"
          >
            <label className="text-sm font-black">Claim code</label>
            <p className="mb-3 mt-1 text-xs text-white/45">Enter the code printed on your mailing label. No business search is required.</p>
            <input className={inputClass} value={claimCode} onChange={(event) => setClaimCode(event.target.value)} placeholder="TOH-XXXX-XXXX" autoCapitalize="characters" />
            <button type="submit" disabled={busy} className="mt-4 w-full rounded-2xl bg-white px-5 py-4 text-sm font-black text-black disabled:opacity-50">Open my business profile</button>
          </form>
        )}

        {location && stage !== "loading" && (
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#101010] shadow-2xl">
            {location.photo ? <img src={location.photo} alt="" className="h-52 w-full object-cover sm:h-64" /> : <div className="flex h-36 items-center justify-center bg-white/[0.04] text-sm font-black text-white/35">Business photo</div>}
            <div className="p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400">{location.claimStatus === "pending" ? "Claim pending" : "Unclaimed profile"}</p>
                  <h2 className="mt-2 text-2xl font-black sm:text-3xl">{location.name}</h2>
                  {address && <p className="mt-2 text-sm leading-6 text-white/55">{address}</p>}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-right">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Profile strength</p>
                  <p className="mt-1 text-2xl font-black">{location.profileStrength}%</p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] p-4">
                <p className="font-black text-amber-200">
                  {location.attentionCount > 0 ? `${location.attentionCount} ${location.attentionCount === 1 ? "item needs" : "items need"} attention.` : "Your core profile information is already in good shape."}
                </p>
                {location.attentionCount > 0 && (
                  <p className="mt-2 text-sm leading-6 text-white/65">Your profile may be missing {location.missingItems.slice(0, 4).join(", ")}.</p>
                )}
              </div>

              {stage === "location" && (
                <>
                  <button type="button" onClick={() => setStage("contact")} className="mt-6 w-full rounded-2xl bg-[#e1062a] px-5 py-4 text-base font-black text-white shadow-lg">Claim This Business</button>
                  <p className="mt-3 text-center text-xs text-white/40">Verify ownership first. No plan selection or full account setup required.</p>
                </>
              )}

              {stage === "contact" && (
                <form onSubmit={requestOtp} className="mt-6">
                  <h3 className="text-xl font-black">Verify you’re connected to this business</h3>
                  <p className="mt-2 text-sm leading-6 text-white/55">Use a business email or mobile number you can access now.</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-white/[0.04] p-1">
                    <button type="button" onClick={() => { setChannel("email"); setContact(""); }} className={`rounded-xl px-4 py-3 text-sm font-black ${channel === "email" ? "bg-white text-black" : "text-white/55"}`}>Business email</button>
                    <button type="button" onClick={() => { setChannel("sms"); setContact(""); }} className={`rounded-xl px-4 py-3 text-sm font-black ${channel === "sms" ? "bg-white text-black" : "text-white/55"}`}>Mobile</button>
                  </div>
                  <input className={`${inputClass} mt-4`} type={channel === "email" ? "email" : "tel"} inputMode={channel === "email" ? "email" : "tel"} value={contact} onChange={(event) => setContact(event.target.value)} placeholder={channel === "email" ? "owner@business.com" : "(555) 555-5555"} autoComplete={channel === "email" ? "email" : "tel"} />
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
                    <ClientTurnstile action="business_claim_otp" onToken={setTurnstileToken} onExpire={() => setTurnstileToken("")} onError={() => setTurnstileToken("")} resetKey={turnstileResetKey} theme="dark" />
                  </div>
                  <button type="submit" disabled={busy} className="mt-4 w-full rounded-2xl bg-[#e1062a] px-5 py-4 text-base font-black text-white disabled:opacity-50">{busy ? "Sending…" : "Send verification code"}</button>
                </form>
              )}

              {stage === "otp" && (
                <form onSubmit={verifyOtpAndClaim} className="mt-6">
                  <h3 className="text-xl font-black">Enter your 6-digit code</h3>
                  <p className="mt-2 text-sm text-white/55">We sent it to {maskedContact}. It expires in 10 minutes.</p>
                  <input className={`${inputClass} mt-4 text-center text-2xl tracking-[0.35em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
                  <button type="submit" disabled={busy} className="mt-4 w-full rounded-2xl bg-[#e1062a] px-5 py-4 text-base font-black text-white disabled:opacity-50">{busy ? "Verifying…" : "Verify & claim business"}</button>
                  <button type="button" onClick={() => { setStage("contact"); setTurnstileToken(""); setTurnstileResetKey((value) => value + 1); }} className="mt-3 w-full px-4 py-2 text-sm font-black text-white/50">Use a different email or mobile</button>
                </form>
              )}

              {stage === "submitted" && (
                <div className="mt-6 rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.08] p-5">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Claim verified</p>
                  <h3 className="mt-2 text-2xl font-black">Your claim is saved.</h3>
                  <p className="mt-2 text-sm leading-6 text-white/65">Profile Strength: {location.profileStrength}%{location.attentionCount > 0 ? ` → complete ${location.attentionCount} ${location.attentionCount === 1 ? "item" : "items"} to move toward 100%.` : ""}</p>
                  {contactMatch ? <p className="mt-3 text-sm font-bold text-emerald-200">Your verified contact matches information already associated with this business.</p> : <p className="mt-3 text-sm text-white/60">Your contact is verified. TheOutHaven will review the ownership match before granting management access.</p>}

                  {channel === "email" ? (
                    <button type="button" onClick={createOwnerAccess} disabled={busy} className="mt-5 w-full rounded-2xl bg-white px-5 py-4 text-sm font-black text-black disabled:opacity-50">Create secure owner access</button>
                  ) : (
                    <p className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/60">You claimed with a mobile number. Your claim is complete; owner-account setup can happen after verification review.</p>
                  )}
                  {accountMessage && <p className="mt-3 text-sm font-bold text-white/75">{accountMessage}</p>}
                  <p className="mt-4 text-xs text-white/40">Claim reference: {claimRequestId}</p>
                </div>
              )}

              {stage === "linked" && (
                <div className="mt-6 rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.08] p-5">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Owner account linked</p>
                  <h3 className="mt-2 text-2xl font-black">{accountMessage || "Your owner access is connected."}</h3>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <Link href="/locations/dashboard" className="rounded-2xl bg-white px-5 py-4 text-center text-sm font-black text-black">Open business dashboard</Link>
                    <Link href={`/locations/${location.locationType || "location"}/${location.id}`} className="rounded-2xl border border-white/10 px-5 py-4 text-center text-sm font-black text-white">Preview customer profile</Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {error && <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/[0.08] p-4 text-sm font-bold text-red-100">{error}</div>}

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {["Appear in AI outing recommendations", "Control photos and business details", "Add reservations, menus, events & experiences"].map((item) => (
            <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm font-bold leading-6 text-white/65">{item}</div>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-white/35">Claim your profile before our fall discovery campaign.</p>
      </section>
    </main>
  );
}

export default function ClaimPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#050505] text-white" />}>
      <ClaimPageInner />
    </Suspense>
  );
}
