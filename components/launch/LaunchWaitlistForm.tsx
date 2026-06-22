"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import ClientTurnstile from "@/components/security/ClientTurnstile";

const CONSENT_TEXT =
  "I agree to receive email and SMS updates from TheOutHaven about beta tester updates, reward details, early access, and outing ideas. Message and data rates may apply. Message frequency may vary. Reply STOP to unsubscribe from texts. I can unsubscribe from emails at any time.";

const DUPLICATE_SOCIAL_MESSAGE =
  "This social handle is already connected to another Beta Tester Reward entry. Please use the same email you signed up with or enter a different handle.";

function isTurnstileEnabled() {
  return String(process.env.NEXT_PUBLIC_TURNSTILE_ENABLED ?? "true").toLowerCase() !== "false";
}

export default function LaunchWaitlistForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [usuallyGoOutArea, setUsuallyGoOutArea] = useState("");
  const wantsGiveaway = true;
  const [socialHandle, setSocialHandle] = useState("");
  const [socialPlatform, setSocialPlatform] = useState("");
  const [followedSocial, setFollowedSocial] = useState(false);
  const [taggedTwoFriends, setTaggedTwoFriends] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const betaInterest = true;
  const [age18Confirmed, setAge18Confirmed] = useState(false);
  const [giveawayRulesAgreed, setGiveawayRulesAgreed] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [turnstileError, setTurnstileError] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const enabledTurnstile = useMemo(() => isTurnstileEnabled(), []);
  const siteKeyMissing = enabledTurnstile && !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const requiredFieldsMissing = !fullName.trim() || !email.trim() || !marketingConsent || (wantsGiveaway && (!age18Confirmed || !giveawayRulesAgreed || !followedSocial || !taggedTwoFriends || !socialHandle.trim() || !["instagram", "tiktok"].includes(socialPlatform)));
  const submitDisabled = loading || requiredFieldsMissing || (enabledTurnstile && !turnstileToken);

  const resetTurnstile = useCallback(() => {
    setTurnstileToken("");
    setTurnstileReady(false);
    setTurnstileKey((current) => current + 1);
  }, []);

  const handleTurnstileToken = useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileReady(true);
    setTurnstileError("");
  }, []);

  const handleTurnstileReady = useCallback(() => {
    setTurnstileReady(true);
    setTurnstileError("");
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken("");
    setTurnstileError("Verification expired. Please try again.");
  }, []);

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken("");
    setTurnstileReady(false);
    setTurnstileError("Verification could not load. Please refresh and try again.");
  }, []);

  const validate = useCallback(() => {
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();
    if (trimmedName.length < 2) return "Please enter your name.";
    if (trimmedName.length > 120) return "Please enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) return "Please enter a valid email address.";
    if (!marketingConsent) return "Please agree to receive Beta Tester Program updates to continue.";
    if (wantsGiveaway && !socialHandle.trim()) return "Please enter your Instagram or TikTok handle for social verification.";
    if (wantsGiveaway && !["instagram", "tiktok"].includes(socialPlatform)) return "Please choose Instagram or TikTok.";
    if (wantsGiveaway && !followedSocial) return "Please confirm you followed @TheOutHaven. Admins verify this before reward qualification.";
    if (wantsGiveaway && !taggedTwoFriends) return "Please confirm you tagged 2 friends. Admins verify this before reward qualification.";
    if (wantsGiveaway && !age18Confirmed) return "Please confirm you are 18+ for the Beta Tester Reward.";
    if (wantsGiveaway && !giveawayRulesAgreed) return "Please agree to the $100 Beta Tester Reward rules.";
    if (enabledTurnstile && !turnstileToken) return "Complete the verification to continue.";
    return "";
  }, [age18Confirmed, email, enabledTurnstile, followedSocial, fullName, giveawayRulesAgreed, marketingConsent, socialHandle, socialPlatform, taggedTwoFriends, turnstileToken, wantsGiveaway]);

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
          betaInterest,
          age18Confirmed: wantsGiveaway ? age18Confirmed : false,
          giveawayRulesAgreed: wantsGiveaway ? giveawayRulesAgreed : false,
          turnstileToken,
          referrer: typeof document !== "undefined" ? document.referrer : null,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setError(payload?.message || (response.status === 409 ? DUPLICATE_SOCIAL_MESSAGE : "Something went wrong. Please try again."));
        if (enabledTurnstile) resetTurnstile();
        return;
      }
      setSuccess(payload?.message || (wantsGiveaway ? "You’re approved for TheOutHaven’s Beta Tester Program. Check your email to create your password and start your weekly beta tasks." : "You’re approved for TheOutHaven’s Beta Tester Program. Check your email for next steps."));
      if (enabledTurnstile) resetTurnstile();
    } catch {
      setError("Something went wrong. Please try again.");
      if (enabledTurnstile) resetTurnstile();
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

      <div className="rounded-3xl border border-rose-300/20 bg-gradient-to-br from-rose-500/15 via-red-950/20 to-black/20 p-5">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">TheOutHaven Beta Tester Program</p>
        <h3 className="mt-2 text-xl font-black text-white">Complete weekly beta tester tasks for a chance to qualify for the $100 Beta Tester Reward.</h3>
        <p className="mt-2 text-sm leading-6 text-white/65">Your application includes the reward entry. Admins still verify your social follow and tagged friends before anyone is marked Prize Qualified. No purchase necessary.</p>
      </div>

      {wantsGiveaway ? (
        <div className="space-y-4 rounded-3xl border border-white/10 bg-black/20 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-bold text-white/85">
              Instagram or TikTok handle
              <input value={socialHandle} onChange={(event) => setSocialHandle(event.target.value)} required={wantsGiveaway} className="w-full rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-white outline-none ring-rose-400/40 transition placeholder:text-white/35 focus:border-rose-300 focus:ring-4" placeholder="@yourhandle" />
              <span className="block text-xs font-medium leading-5 text-white/50">Required for Beta Tester Reward social verification.</span>
            </label>
            <label className="space-y-2 text-sm font-bold text-white/85">
              Social verification platform
              <select value={socialPlatform} onChange={(event) => setSocialPlatform(event.target.value)} required={wantsGiveaway} className="w-full rounded-2xl border border-white/10 bg-[#180807] px-4 py-3 text-white outline-none ring-rose-400/40 transition focus:border-rose-300 focus:ring-4">
                <option value="">Choose platform</option>
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
              </select>
            </label>
          </div>
          <div className="grid gap-3 text-sm text-white/75">
            <label className="flex items-start gap-3"><input type="checkbox" checked={followedSocial} onChange={(event) => setFollowedSocial(event.target.checked)} className="mt-1 h-4 w-4 accent-rose-500" />I followed @TheOutHaven on Instagram or TikTok (admin verified later)</label>
            <label className="flex items-start gap-3"><input type="checkbox" checked={taggedTwoFriends} onChange={(event) => setTaggedTwoFriends(event.target.checked)} className="mt-1 h-4 w-4 accent-rose-500" />I tagged 2 friends in the Beta Tester Program reward post comments (admin verified later)</label>
            <label className="flex items-start gap-3"><input type="checkbox" checked={age18Confirmed} onChange={(event) => setAge18Confirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-rose-500" />I confirm I am 18 or older</label>
            <label className="flex items-start gap-3"><input type="checkbox" checked={giveawayRulesAgreed} onChange={(event) => setGiveawayRulesAgreed(event.target.checked)} className="mt-1 h-4 w-4 accent-rose-500" />I agree to the $100 Beta Tester Reward rules, including completing required weekly beta tasks</label>
            <p className="text-xs leading-5 text-white/45">These checkboxes are self-reported only. TheOutHaven manually verifies social follow and tagged friends before marking anyone Prize Qualified.</p>
          </div>
        </div>
      ) : null}

      <label className="flex cursor-pointer items-start gap-3 rounded-3xl border border-white/10 bg-white/[0.05] p-4">
        <input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} className="mt-1 h-5 w-5 accent-rose-500" required />
        <span className="text-sm leading-6 text-white/72">{CONSENT_TEXT}</span>
      </label>
      {enabledTurnstile ? (
        <div className="space-y-2">
          <ClientTurnstile
            key={turnstileKey}
            resetKey={turnstileKey}
            action="launch_waitlist"
            onToken={handleTurnstileToken}
            onReady={handleTurnstileReady}
            onExpire={handleTurnstileExpire}
            onError={handleTurnstileError}
            theme="dark"
          />
          {!turnstileReady && !turnstileError && !siteKeyMissing ? <p className="text-xs font-bold text-white/50">Verification is loading. Complete it to continue.</p> : null}
          {turnstileError ? <p className="text-xs font-bold text-amber-100">{turnstileError}</p> : null}
          {enabledTurnstile && !turnstileToken ? <p className="text-xs font-bold text-white/50">Complete the verification to continue.</p> : null}
        </div>
      ) : null}

      {error ? <div className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">{error}</div> : null}
      {success ? <div className="rounded-2xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100">{success}</div> : null}

      <button type="submit" disabled={submitDisabled} className="w-full rounded-full bg-gradient-to-r from-rose-500 to-red-700 px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-2xl shadow-rose-950/40 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60">
        {loading ? "Joining..." : "Join the Beta Tester Program"}
      </button>
    </form>
  );
}
