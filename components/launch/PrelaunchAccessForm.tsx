"use client";

import { FormEvent, useMemo, useState } from "react";
import ClientTurnstile from "@/components/security/ClientTurnstile";

function isTurnstileEnabled() {
  return String(process.env.NEXT_PUBLIC_TURNSTILE_ENABLED ?? "true").toLowerCase() !== "false";
}

export default function PrelaunchAccessForm() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const enabledTurnstile = useMemo(() => isTurnstileEnabled(), []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const normalizedEmail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (enabledTurnstile && !token) {
      setError("Complete the verification to continue.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/launch/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: "Prelaunch Member",
          email: normalizedEmail,
          phone: null,
          usuallyGoOutArea: null,
          wantsGiveaway: false,
          followedSocial: false,
          followedInstagram: false,
          followedTiktok: false,
          taggedTwoFriends: false,
          marketingConsent: true,
          betaInterest: false,
          age18Confirmed: false,
          giveawayRulesAgreed: false,
          turnstileToken: token,
          referrer: typeof document !== "undefined" ? document.referrer : null,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setError(payload?.message || "We could not add you right now. Please try again.");
        return;
      }
      setSuccess("You’re on the prelaunch list. Check your email for next steps.");
      setEmail("");
      setToken("");
    } catch {
      setError("We could not add you right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <div className="flex flex-col overflow-hidden rounded-xl border border-white/15 bg-white/[0.035] sm:flex-row">
        <label className="sr-only" htmlFor="prelaunch-email">Email address</label>
        <input
          id="prelaunch-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Enter your email address"
          className="min-h-14 min-w-0 flex-1 bg-transparent px-5 text-base text-white outline-none placeholder:text-white/45"
          required
        />
        <button
          type="submit"
          disabled={loading || (enabledTurnstile && !token)}
          className="min-h-14 bg-[#e1062a] px-7 text-sm font-black text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Joining..." : "Join Prelaunch"}
        </button>
      </div>

      {enabledTurnstile ? (
        <ClientTurnstile
          action="launch_waitlist"
          onToken={setToken}
          onExpire={() => setToken("")}
          onError={() => setError("Verification could not load. Refresh and try again.")}
          theme="dark"
        />
      ) : null}

      {error ? <p className="text-sm font-bold text-red-200">{error}</p> : null}
      {success ? <p className="text-sm font-bold text-emerald-200">{success}</p> : null}
      <p className="text-xs text-white/45">No spam. Unsubscribe anytime.</p>
    </form>
  );
}
