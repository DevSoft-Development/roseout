"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  locationId: string;
  locationName: string;
  context: Record<string, string>;
  demoMode: boolean;
};

const field =
  "w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-rose-400/60";
const button =
  "rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-black text-white/80 hover:bg-white/10";
const primary =
  "rounded-xl bg-gradient-to-r from-[#e1062a] to-[#ff2142] px-4 py-2 text-sm font-black text-white disabled:opacity-50";

function query(context: Record<string, string>) {
  return new URLSearchParams(context).toString();
}

export default function NotificationSettingsManager({
  locationId,
  locationName,
  context,
  demoMode,
}: Props) {
  const [data, setData] = useState<any>({
    notifications: [],
    recipients: [],
    preferences: [],
    deliveries: [],
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [recipient, setRecipient] = useState({
    name: "",
    email: demoMode ? "admin@theouthaven.com" : "",
    phone: "",
    role: "owner",
    isPrimary: false,
    receivesAll: true,
  });
  const [preference, setPreference] = useState({
    eventType: "reservation_created",
    emailEnabled: true,
    dashboardEnabled: true,
    smsEnabled: false,
    digestOnly: false,
  });

  const apiContext = useMemo(
    () => ({ ...context, locationId }),
    [context, locationId],
  );

  async function load() {
    const res = await fetch(`/api/business/notifications?${query(apiContext)}`, {
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setData(json);
    else setMessage(json.message || "Notification settings could not be loaded.");
  }

  useEffect(() => {
    void load();
  }, [locationId]);

  async function mutate(method: string, payload: Record<string, any>) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/business/notifications", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...apiContext, ...payload }),
      });
      const json = await res.json().catch(() => ({}));
      setMessage(json.message || (res.ok ? "Saved." : "Could not save changes."));
      if (res.ok) await load();
      return res.ok;
    } finally {
      setBusy(false);
    }
  }

  async function addRecipient() {
    const ok = await mutate("POST", { action: "create_recipient", ...recipient });
    if (ok) {
      setRecipient({
        name: "",
        email: demoMode ? "admin@theouthaven.com" : "",
        phone: "",
        role: "owner",
        isPrimary: false,
        receivesAll: true,
      });
    }
  }

  async function savePreference() {
    await mutate("POST", { action: "upsert_preference", ...preference });
  }

  return (
    <main className="min-h-screen bg-[#07090d] p-4 text-white sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="rounded-[2rem] border border-white/10 bg-[#10131a] p-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">
            Notification Center
          </p>
          <h1 className="mt-2 text-3xl font-black">{locationName}</h1>
          <p className="mt-2 text-sm font-bold text-white/50">
            Manage recipients, event preferences, unread activity, and delivery history.
          </p>
          {demoMode ? (
            <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm font-bold text-amber-100">
              Demo mode: recipients are restricted to approved TheOutHaven demo/admin email addresses and SMS is forced off.
            </p>
          ) : null}
        </header>

        {message ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-white/75">
            {message}
          </div>
        ) : null}

        <section className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
            <h2 className="text-xl font-black">Recipients</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input className={field} placeholder="Name" value={recipient.name} onChange={(e) => setRecipient((v) => ({ ...v, name: e.target.value }))} />
              <input className={field} placeholder="Email" value={recipient.email} onChange={(e) => setRecipient((v) => ({ ...v, email: e.target.value }))} />
              <input className={field} placeholder="Phone" value={recipient.phone} disabled={demoMode} onChange={(e) => setRecipient((v) => ({ ...v, phone: e.target.value }))} />
              <input className={field} placeholder="Role" value={recipient.role} onChange={(e) => setRecipient((v) => ({ ...v, role: e.target.value }))} />
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm font-bold text-white/60">
              <label><input type="checkbox" checked={recipient.isPrimary} onChange={(e) => setRecipient((v) => ({ ...v, isPrimary: e.target.checked }))} /> Primary</label>
              <label><input type="checkbox" checked={recipient.receivesAll} onChange={(e) => setRecipient((v) => ({ ...v, receivesAll: e.target.checked }))} /> Receives all</label>
            </div>
            <button className={`${primary} mt-4`} disabled={busy} onClick={addRecipient}>Add recipient</button>

            <div className="mt-5 space-y-3">
              {(data.recipients || []).map((entry: any) => (
                <div key={entry.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black">{entry.name || entry.email}</p>
                      <p className="mt-1 text-xs text-white/45">{entry.email} · {entry.role || "owner"}</p>
                    </div>
                    <button className={button} disabled={busy} onClick={() => mutate("DELETE", { recipientId: entry.id })}>Remove</button>
                  </div>
                </div>
              ))}
              {!data.recipients?.length ? <p className="text-sm font-bold text-white/40">No recipients configured.</p> : null}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
            <h2 className="text-xl font-black">Event preferences</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <select className={field} value={preference.eventType} onChange={(e) => setPreference((v) => ({ ...v, eventType: e.target.value }))}>
                <option value="reservation_created">Reservation created</option>
                <option value="reservation_cancelled">Reservation cancelled</option>
                <option value="private_event_lead_created">Event lead</option>
                <option value="vip_signup_created">VIP signup</option>
                <option value="offer_claim_created">Offer claim</option>
                <option value="private_feedback_submitted">Private feedback</option>
                <option value="guest_checked_in">Guest check-in</option>
              </select>
            </div>
            <div className="mt-4 grid gap-3 text-sm font-bold text-white/65 sm:grid-cols-2">
              {[
                ["emailEnabled", "Email"],
                ["dashboardEnabled", "Dashboard"],
                ["smsEnabled", "SMS"],
                ["digestOnly", "Digest only"],
              ].map(([key, label]) => (
                <label key={key} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <input
                    type="checkbox"
                    disabled={demoMode && key === "smsEnabled"}
                    checked={(preference as any)[key]}
                    onChange={(e) => setPreference((v) => ({ ...v, [key]: e.target.checked }))}
                  />{" "}{label}
                </label>
              ))}
            </div>
            <button className={`${primary} mt-4`} disabled={busy} onClick={savePreference}>Save preference</button>

            <div className="mt-5 space-y-2">
              {(data.preferences || []).map((entry: any) => (
                <div key={entry.id || entry.event_type} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm">
                  <p className="font-black">{entry.event_type}</p>
                  <p className="mt-1 text-white/45">Email {entry.email_enabled ? "on" : "off"} · Dashboard {entry.dashboard_enabled ? "on" : "off"} · SMS {entry.sms_enabled ? "on" : "off"}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
            <h2 className="text-xl font-black">Recent notifications</h2>
            <div className="mt-4 space-y-3">
              {(data.notifications || []).slice(0, 20).map((entry: any) => (
                <div key={entry.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-black">{entry.title}</p><p className="mt-1 text-xs text-white/45">{entry.event_type} · {entry.priority || "normal"}</p></div>
                    <button className={button} disabled={busy} onClick={() => mutate("PATCH", { action: "mark_read", notificationId: entry.id })}>Mark read</button>
                  </div>
                  {entry.message ? <p className="mt-2 text-sm text-white/60">{entry.message}</p> : null}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
            <h2 className="text-xl font-black">Delivery history</h2>
            <div className="mt-4 space-y-3">
              {(data.deliveries || []).slice(0, 20).map((entry: any) => (
                <div key={entry.id} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
                  <p className="font-black">{entry.channel || "delivery"} · {entry.status || "unknown"}</p>
                  <p className="mt-1 text-white/45">{entry.recipient_email || entry.recipient_phone || "No recipient"}</p>
                </div>
              ))}
              {!data.deliveries?.length ? <p className="text-sm font-bold text-white/40">No delivery history yet.</p> : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
