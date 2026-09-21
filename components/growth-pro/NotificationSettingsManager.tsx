"use client";

import { useEffect, useMemo, useState } from "react";
import { BusinessStatusBadge } from "@/components/business/BusinessDesignSystem";

type Props = {
  locationId: string;
  locationName: string;
  context: Record<string, string>;
  demoMode: boolean;
};

const field =
  "w-full rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] px-3 py-2.5 text-sm font-bold text-[var(--business-text)] outline-none transition placeholder:text-[var(--business-muted)] focus:border-rose-400/60";
const button =
  "rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] px-4 py-2 text-sm font-black text-[var(--business-soft)] transition hover:border-[#ff2142]/35 hover:text-[var(--business-text)] disabled:opacity-50";
const primary =
  "rounded-xl bg-gradient-to-r from-[#e1062a] to-[#ff2142] px-4 py-2 text-sm font-black text-white shadow-lg shadow-black/10 disabled:opacity-50";
const panel =
  "rounded-[2rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-5 sm:p-6";
const row =
  "rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-4";

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
    <div className="space-y-5">
      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">Notification workspace</p>
            <h2 className="mt-1 text-xl font-black">{locationName}</h2>
          </div>
          <BusinessStatusBadge tone={demoMode ? "amber" : "blue"}>
            {demoMode ? "SMS disabled in demo" : "Live settings"}
          </BusinessStatusBadge>
        </div>
        {demoMode ? (
          <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm font-bold text-amber-200">
            Demo mode restricts recipients to approved TheOutHaven demo/admin email addresses and forces SMS off.
          </p>
        ) : null}
      </section>

      {message ? (
        <div className="rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] px-4 py-3 text-sm font-bold text-[var(--business-soft)]">
          {message}
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-2">
        <div className={panel}>
          <h2 className="text-xl font-black">Recipients</h2>
          <p className="mt-1 text-sm font-semibold text-[var(--business-muted)]">
            Choose who receives location alerts and operational notifications.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input className={field} placeholder="Name" value={recipient.name} onChange={(e) => setRecipient((v) => ({ ...v, name: e.target.value }))} />
            <input className={field} placeholder="Email" value={recipient.email} onChange={(e) => setRecipient((v) => ({ ...v, email: e.target.value }))} />
            <input className={field} placeholder="Phone" value={recipient.phone} disabled={demoMode} onChange={(e) => setRecipient((v) => ({ ...v, phone: e.target.value }))} />
            <input className={field} placeholder="Role" value={recipient.role} onChange={(e) => setRecipient((v) => ({ ...v, role: e.target.value }))} />
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm font-bold text-[var(--business-soft)]">
            <label><input type="checkbox" checked={recipient.isPrimary} onChange={(e) => setRecipient((v) => ({ ...v, isPrimary: e.target.checked }))} /> Primary</label>
            <label><input type="checkbox" checked={recipient.receivesAll} onChange={(e) => setRecipient((v) => ({ ...v, receivesAll: e.target.checked }))} /> Receives all</label>
          </div>
          <button className={`${primary} mt-4`} disabled={busy} onClick={addRecipient}>Add recipient</button>

          <div className="mt-5 space-y-3">
            {(data.recipients || []).map((entry: any) => (
              <div key={entry.id} className={row}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{entry.name || entry.email}</p>
                    <p className="mt-1 text-xs text-[var(--business-muted)]">{entry.email} · {entry.role || "owner"}</p>
                  </div>
                  <button className={button} disabled={busy} onClick={() => mutate("DELETE", { recipientId: entry.id })}>Remove</button>
                </div>
              </div>
            ))}
            {!data.recipients?.length ? <p className="text-sm font-bold text-[var(--business-muted)]">No recipients configured.</p> : null}
          </div>
        </div>

        <div className={panel}>
          <h2 className="text-xl font-black">Event preferences</h2>
          <p className="mt-1 text-sm font-semibold text-[var(--business-muted)]">
            Control channels for the events that matter to your team.
          </p>
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
          <div className="mt-4 grid gap-3 text-sm font-bold text-[var(--business-soft)] sm:grid-cols-2">
            {[
              ["emailEnabled", "Email"],
              ["dashboardEnabled", "Dashboard"],
              ["smsEnabled", "SMS"],
              ["digestOnly", "Digest only"],
            ].map(([key, label]) => (
              <label key={key} className={row}>
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
              <div key={entry.id || entry.event_type} className={`${row} text-sm`}>
                <p className="font-black">{entry.event_type}</p>
                <p className="mt-1 text-[var(--business-muted)]">Email {entry.email_enabled ? "on" : "off"} · Dashboard {entry.dashboard_enabled ? "on" : "off"} · SMS {entry.sms_enabled ? "on" : "off"}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className={panel}>
          <h2 className="text-xl font-black">Recent notifications</h2>
          <div className="mt-4 space-y-3">
            {(data.notifications || []).slice(0, 20).map((entry: any) => (
              <div key={entry.id} className={row}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{entry.title}</p>
                    <p className="mt-1 text-xs text-[var(--business-muted)]">{entry.event_type} · {entry.priority || "normal"}</p>
                  </div>
                  <button className={button} disabled={busy} onClick={() => mutate("PATCH", { action: "mark_read", notificationId: entry.id })}>Mark read</button>
                </div>
                {entry.message ? <p className="mt-2 text-sm text-[var(--business-soft)]">{entry.message}</p> : null}
              </div>
            ))}
            {!data.notifications?.length ? <p className="text-sm font-bold text-[var(--business-muted)]">No recent notifications.</p> : null}
          </div>
        </div>

        <div className={panel}>
          <h2 className="text-xl font-black">Delivery history</h2>
          <div className="mt-4 space-y-3">
            {(data.deliveries || []).slice(0, 20).map((entry: any) => (
              <div key={entry.id} className={`${row} text-sm`}>
                <p className="font-black">{entry.channel || "delivery"} · {entry.status || "unknown"}</p>
                <p className="mt-1 text-[var(--business-muted)]">{entry.recipient_email || entry.recipient_phone || "No recipient"}</p>
              </div>
            ))}
            {!data.deliveries?.length ? <p className="text-sm font-bold text-[var(--business-muted)]">No delivery history yet.</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
