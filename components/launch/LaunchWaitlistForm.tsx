"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import TurnstileWidget from "@/components/security/TurnstileWidget";

const CONSENT_TEXT =
  "I agree to receive email and SMS updates from TheOutHaven about launch updates, giveaway details, early access, and outing ideas. Message and data rates may apply. Message frequency may vary. Reply STOP to unsubscribe from texts. I can unsubscribe from emails at any time.";

const DUPLICATE_SOCIAL_MESSAGE =
  "This social handle is already connected to another giveaway entry. Please use the same email you signed up with or enter a different handle.";

function isTurnstileEnabled() {
  return String(process.env.NEXT_PUBLIC_TURNSTILE_ENABLED ?? process.env.TURNSTILE_ENABLED ?? "true").toLowerCase() !== "false";
}

export default function LaunchWaitlistForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [usuallyGoOutArea, setUsuallyGoOutArea] = useState("");
  const [wantsGiveaway, setWantsGiveaway] = useState(true);
  const [socialHandle, setSocialHandle] = useState("");
  const [socialPlatform, setSocialPlatform] = useState("");
  const [followedSocial, setFollowedSocial] = useState(false);
  const [taggedTwoFriends, setTaggedTwoFriends] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const enabledTurnstile = useMemo(() => isTurnstileEnabled(), []);

  const validate = useCallback(() => {
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();
    if (trimmedName.length < 2) return "Please enter your name.";
    if (trimmedName.length > 120) return "Please enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) return "Please enter a valid email address.";
    if (!marketingConsent) return "Please agree to the launch list and giveaway terms to continue.";
    if (wantsGiveaway && !socialHandle.trim()) return "Please enter your Instagram or TikTok handle to join the giveaway.";
    if (wantsGiveaway && !["instagram", "tiktok", "both"].includes(socialPlatform)) return "Please choose Instagram, TikTok, or Both.";
    if (enabledTurnstile && !turnstileToken) return "Verification failed. Please refresh and try again.";
    return "";
  }, [email, enabledTurnstile, fullName, marketingConsent, socialHandle, socialPlatform, turnstileToken, wantsGiveaway]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/launch/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          phone,
          usuallyGoOutArea,
          wantsGiveaway,
          socialHandle: wantsGiveaway ? socialHandle : null,
          socialPlatform: wantsGiveaway ? socialPlatform : null,
          followedSocial: wantsGiveaway ? followedSocial : false,
          taggedTwoFriends: wantsGiveaway ? taggedTwoFriends : false,
          marketingConsent,
          turnstileToken,
          referrer: typeof document !== "undefined" ? document.referrer : null,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setError(payload?.message || (response.status === 409 ? DUPLICATE_SOCIAL_MESSAGE : "Something went wrong. Please try again."));
        return;
      }
      setSuccess(payload?.message || (wantsGiveaway ? "Almost done. Check your email and tap Verify Email to complete your giveaway entry." : "Almost done. Check your email and tap Verify Email to confirm your launch list signup."));
      setTurnstileToken("");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-bold text-white/85">
          Full name
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} minLength={2} maxLength={120} required className="w-full rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-white outline-none ring-rose-400/40 transition placeholder:text-white/35 focus:border-rose-300 focus:ring-4" placeholder="Your name" />
        </label>
        <label className="space-y-2 text-sm font-bold text-white/85">
          Email address
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required className="w-full rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-white outline-none ring-rose-400/40 transition placeholder:text-white/35 focus:border-rose-300 focus:ring-4" placeholder="you@example.com" />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-bold text-white/85">
          Phone number <span className="font-medium text-white/45">optional</span>
          <input value={phone} onChange={(event) => setPhone(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-white outline-none ring-rose-400/40 transition placeholder:text-white/35 focus:border-rose-300 focus:ring-4" placeholder="For SMS launch updates" />
        </label>
        <label className="space-y-2 text-sm font-bold text-white/85">
          Where do you usually go out? <span className="font-medium text-white/45">optional</span>
          <input value={usuallyGoOutArea} onChange={(event) => setUsuallyGoOutArea(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-white outline-none ring-rose-400/40 transition placeholder:text-white/35 focus:border-rose-300 focus:ring-4" placeholder="NYC, Queens, Brooklyn..." />
        </label>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-3xl border border-rose-300/20 bg-rose-500/10 p-4">
        <input type="checkbox" checked={wantsGiveaway} onChange={(event) => setWantsGiveaway(event.target.checked)} className="mt-1 h-5 w-5 accent-rose-500" />
        <span>
          <span className="block text-base font-black text-white">Enter the $100 gift card giveaway</span>
          <span className="mt-1 block text-sm leading-6 text-white/65">To qualify for the giveaway, follow @TheOutHaven on Instagram or TikTok, tag 2 friends in the giveaway post comments, and verify your email.</span>
        </span>
      </label>

      {wantsGiveaway ? (
        <div className="space-y-4 rounded-3xl border border-white/10 bg-black/20 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-bold text-white/85">
              Instagram or TikTok handle
              <input value={socialHandle} onChange={(event) => setSocialHandle(event.target.value)} required={wantsGiveaway} className="w-full rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-white outline-none ring-rose-400/40 transition placeholder:text-white/35 focus:border-rose-300 focus:ring-4" placeholder="@yourhandle" />
              <span className="block text-xs font-medium leading-5 text-white/50">Required for giveaway entry so we can verify your follow and tagged friends.</span>
            </label>
            <label className="space-y-2 text-sm font-bold text-white/85">
              Platform followed
              <select value={socialPlatform} onChange={(event) => setSocialPlatform(event.target.value)} required={wantsGiveaway} className="w-full rounded-2xl border border-white/10 bg-[#180807] px-4 py-3 text-white outline-none ring-rose-400/40 transition focus:border-rose-300 focus:ring-4">
                <option value="">Choose platform</option>
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="both">Both</option>
              </select>
            </label>
          </div>
          <div className="grid gap-3 text-sm text-white/75">
            <label className="flex items-start gap-3"><input type="checkbox" checked={followedSocial} onChange={(event) => setFollowedSocial(event.target.checked)} className="mt-1 h-4 w-4 accent-rose-500" />I followed @TheOutHaven on Instagram or TikTok</label>
            <label className="flex items-start gap-3"><input type="checkbox" checked={taggedTwoFriends} onChange={(event) => setTaggedTwoFriends(event.target.checked)} className="mt-1 h-4 w-4 accent-rose-500" />I tagged 2 friends in the giveaway post comments</label>
            <p className="text-xs leading-5 text-white/45">These checkboxes are self-reported only. TheOutHaven manually verifies follows and tagged friends before marking an entry verified.</p>
          </div>
        </div>
      ) : null}

      <label className="flex cursor-pointer items-start gap-3 rounded-3xl border border-white/10 bg-white/[0.05] p-4">
        <input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} className="mt-1 h-5 w-5 accent-rose-500" required />
        <span className="text-sm leading-6 text-white/72">{CONSENT_TEXT}</span>
      </label>
      <p className="text-xs leading-5 text-white/45">By checking this box, you agree to receive email and SMS messages from TheOutHaven about launch updates, giveaway details, early access, and outing ideas. Message and data rates may apply. Message frequency may vary. Reply STOP to unsubscribe from texts. You can unsubscribe from emails at any time.</p>

      {enabledTurnstile ? <TurnstileWidget action="launch_waitlist" onToken={setTurnstileToken} onExpire={() => setTurnstileToken("")} onError={() => setTurnstileToken("")} theme="dark" /> : null}

      {error ? <div className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">{error}</div> : null}
      {success ? <div className="rounded-2xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100">{success}</div> : null}

      <button type="submit" disabled={loading} className="w-full rounded-full bg-gradient-to-r from-rose-500 to-red-700 px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-2xl shadow-rose-950/40 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60">
        {loading ? "Joining..." : wantsGiveaway ? "Join Launch List + Enter Giveaway" : "Join Launch List"}
      </button>
    </form>
  );
}
