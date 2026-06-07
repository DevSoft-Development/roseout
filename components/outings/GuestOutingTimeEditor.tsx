"use client";

import { useState } from "react";
import OutingTimeSelector from "@/components/outings/OutingTimeSelector";
import { emptyOutingTimeValue, type OutingTimeValue } from "@/lib/outings/planned-time-client";

type Props = {
  token: string;
  initialValue: OutingTimeValue;
  initialEmail?: string | null;
  initialName?: string | null;
  initialPhone?: string | null;
  initialEmailOptIn?: boolean | null;
  initialSmsOptIn?: boolean | null;
};

export default function GuestOutingTimeEditor({ token, initialValue, initialEmail, initialName, initialPhone, initialEmailOptIn, initialSmsOptIn }: Props) {
  const [value, setValue] = useState<OutingTimeValue>(initialValue || emptyOutingTimeValue());
  const [guestEmail, setGuestEmail] = useState(initialEmail || "");
  const [guestName, setGuestName] = useState(initialName || "");
  const [guestPhone, setGuestPhone] = useState(initialPhone || "");
  const [emailOptIn, setEmailOptIn] = useState(Boolean(initialEmailOptIn));
  const [smsOptIn, setSmsOptIn] = useState(Boolean(initialSmsOptIn));
  const [status, setStatus] = useState("");

  async function save() {
    setStatus("Saving…");
    const response = await fetch(`/api/outings/guest/${token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...value, guestEmail, guestName, guestPhone, emailOptIn, smsOptIn }),
    });
    const data = await response.json().catch(() => ({}));
    setStatus(response.ok && data.ok ? "Outing time saved." : data.message || "We could not save this update.");
  }

  return (
    <div className="mt-5 space-y-4">
      <OutingTimeSelector value={value} onChange={setValue} />
      {(value.nextMorningFollowupEnabled || value.remindersEnabled) ? (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <p className="text-sm font-black">Contact for your secure follow-up</p>
          <p className="mt-1 text-xs font-semibold text-white/55">We’ll check in tomorrow to see how everything went.</p>
          <div className="mt-3 grid gap-2">
            <input value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} placeholder="Email" className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm font-semibold text-white" />
            <input value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="Name optional" className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm font-semibold text-white" />
            <input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} placeholder="Phone optional" className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm font-semibold text-white" />
            <label className="flex gap-2 text-xs font-bold text-white/70"><input type="checkbox" checked={emailOptIn} onChange={(event) => setEmailOptIn(event.target.checked)} />Email me my plan and follow-up</label>
            <label className="flex gap-2 text-xs font-bold text-white/70"><input type="checkbox" checked={smsOptIn} onChange={(event) => setSmsOptIn(event.target.checked)} />Text me reminders and follow-up</label>
          </div>
        </div>
      ) : null}
      <button type="button" onClick={save} className="rounded-full bg-rose-500 px-5 py-3 font-bold">Save outing time</button>
      {status ? <p className="text-sm font-bold text-white/60">{status}</p> : null}
    </div>
  );
}
