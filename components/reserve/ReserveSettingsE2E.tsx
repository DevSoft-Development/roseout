"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const PERMISSIONS = [
  ["viewDashboard", "View reservations"],
  ["manageReservations", "Manage reservations"],
  ["manageLayout", "Manage layout & spaces"],
  ["manageHours", "Manage hours & availability"],
  ["manageReminders", "Manage reminders & alerts"],
  ["manageQrCodes", "Manage QR codes"],
  ["editProfile", "Edit location details"],
  ["viewAnalytics", "View reports"],
  ["manageBilling", "Manage billing"],
  ["manageTeam", "Manage team access"],
] as const;

const ROLE_LABELS: Record<string, string> = {
  location_admin: "Location admin",
  manager: "Manager",
  host: "Host / front desk",
  marketing: "Marketing",
  view_only: "View only",
};

const INVITE_LABELS: Record<string, string> = {
  pending: "Invite sent",
  invited: "Invite sent",
  accepted: "Active",
  active: "Active",
  revoked: "Access removed",
  expired: "Invite expired",
};

const REMINDER_STATUS_LABELS: Record<string, string> = {
  scheduled: "Upcoming",
  sent: "Sent",
  failed: "Needs attention",
  cancelled: "Cancelled",
};

const REMINDER_TYPE_LABELS: Record<string, string> = {
  reminder_24h: "24-hour guest reminder",
  reminder_2h: "2-hour guest reminder",
  table_ready: "Ready message",
  reservation_changed: "Reservation change",
  cancellation: "Cancellation",
};

function Card({ children }: { children: React.ReactNode }) {
  return <div className="reserve-soft rounded-[1.25rem] p-4">{children}</div>;
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/10 p-3 text-sm font-bold">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function formatReminderDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatReservationDate(date: unknown, time: unknown) {
  const rawDate = String(date || "");
  const rawTime = String(time || "").slice(0, 5);
  if (!rawDate) return "—";
  const parsed = new Date(`${rawDate}T${rawTime || "12:00"}:00`);
  if (Number.isNaN(parsed.getTime())) return `${rawDate} ${rawTime}`.trim();
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: rawTime ? "numeric" : undefined,
    minute: rawTime ? "2-digit" : undefined,
  }).format(parsed);
}

export function ReserveRemindersSettings({ locationId }: { locationId: string }) {
  const [data, setData] = useState<any>();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const canManage = Boolean(data?.access?.permissions?.manageReminders);

  const load = () =>
    locationId &&
    fetch(`/api/reserve/portal/reminders?locationId=${encodeURIComponent(locationId)}`)
      .then((response) => response.json())
      .then(setData);

  useEffect(() => {
    void load();
  }, [locationId]);

  const settings = data?.settings || {};

  function setSetting(key: string, value: boolean) {
    setData((current: any) => ({
      ...current,
      settings: { ...current.settings, [key]: value },
    }));
  }

  async function save() {
    setSaving(true);
    setNotice("");
    const response = await fetch("/api/reserve/portal/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId, reminders: data.settings }),
    });
    setSaving(false);
    setNotice(response.ok ? "Reminder settings saved." : "We could not save reminder settings.");
    if (response.ok) await load();
  }

  return (
    <div>
      <h3 className="text-xl font-black">Reminders & alerts</h3>
      <p className="mt-1 text-sm leading-6 reserve-muted">
        Choose which messages guests receive and which reservation updates your team should see.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card>
          <h4 className="font-black">Guest reminders</h4>
          <div className="mt-3 space-y-2">
            {[
              ["guest24h", "24 hours before"],
              ["guest2h", "2 hours before"],
              ["tableReady", "Table or space is ready"],
              ["reservationChanged", "Reservation changed"],
              ["cancellation", "Reservation cancelled"],
            ].map(([key, label]) => (
              <Toggle
                key={key}
                label={label}
                checked={Boolean(settings[key])}
                disabled={!canManage}
                onChange={(value) => setSetting(key, value)}
              />
            ))}
          </div>
        </Card>

        <Card>
          <h4 className="font-black">Team alerts</h4>
          <div className="mt-3 space-y-2">
            {[
              ["dailyStaffDigest", "Daily reservation summary"],
              ["largePartyAlerts", "Large-party alert"],
              ["vipAlerts", "VIP guest alert"],
            ].map(([key, label]) => (
              <Toggle
                key={key}
                label={label}
                checked={Boolean(settings[key])}
                disabled={!canManage}
                onChange={(value) => setSetting(key, value)}
              />
            ))}
          </div>
        </Card>

        <Card>
          <h4 className="font-black">Guest message methods</h4>
          <div className="mt-3 space-y-2">
            <Toggle
              label="Email"
              checked={Boolean(settings.email)}
              disabled={!canManage}
              onChange={(value) => setSetting("email", value)}
            />
            <div className="rounded-xl border border-white/10 p-3 text-sm font-bold">
              <p>Text messages</p>
              <p className="mt-1 text-xs reserve-muted">
                {settings.sms
                  ? "Connected and available"
                  : "Not connected for this location"}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["scheduled", "Upcoming"],
          ["sent", "Sent"],
          ["failed", "Needs attention"],
          ["cancelled", "Cancelled"],
        ].map(([key, label]) => (
          <Card key={key}>
            <p className="text-xs font-black uppercase tracking-[0.12em] reserve-muted">
              {label}
            </p>
            <p className="mt-1 text-2xl font-black">{data?.counts?.[key] || 0}</p>
          </Card>
        ))}
      </div>

      <div className="mt-4">
        <Card>
          <h4 className="font-black">Recent reminder activity</h4>
          {(data?.recent || []).length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="text-xs reserve-muted">
                  <tr>
                    <th className="pb-2 font-bold">Guest</th>
                    <th className="pb-2 font-bold">Reservation</th>
                    <th className="pb-2 font-bold">Message</th>
                    <th className="pb-2 font-bold">Status</th>
                    <th className="pb-2 font-bold">When</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recent || []).map((row: any) => (
                    <tr key={row.id} className="border-t border-white/10">
                      <td className="py-3 font-bold">
                        {row.location_reservations?.customer_name || "Guest"}
                      </td>
                      <td className="py-3 reserve-muted">
                        {formatReservationDate(
                          row.location_reservations?.reservation_date,
                          row.location_reservations?.reservation_time,
                        )}
                      </td>
                      <td className="py-3">
                        {REMINDER_TYPE_LABELS[row.reminder_type] || "Reservation reminder"}
                      </td>
                      <td className="py-3">
                        {REMINDER_STATUS_LABELS[row.status] || "Pending"}
                      </td>
                      <td className="py-3 reserve-muted">
                        {formatReminderDate(row.sent_at || row.scheduled_for)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm reserve-muted">
              Reminder activity will appear here after messages are scheduled or sent.
            </p>
          )}
        </Card>
      </div>

      {notice ? <p className="mt-3 text-sm font-bold">{notice}</p> : null}
      {!canManage ? (
        <p className="mt-3 text-sm reserve-muted">
          You can view reminders, but your role cannot change them.
        </p>
      ) : (
        <button
          onClick={save}
          disabled={saving}
          className="reserve-primary mt-4 rounded-full px-4 py-2.5 text-sm font-black disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save reminders & alerts"}
        </button>
      )}
    </div>
  );
}

export function ReserveQrSettings({ locationId }: { locationId: string }) {
  const [data, setData] = useState<any>();

  const load = () =>
    locationId &&
    fetch(`/api/reserve/portal/qr?locationId=${encodeURIComponent(locationId)}`)
      .then((response) => response.json())
      .then(setData);

  useEffect(() => {
    void load();
  }, [locationId]);

  async function generateMissing() {
    await fetch("/api/reserve/portal/qr/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId }),
    });
    await load();
  }

  function qrCard(title: string, description: string, url: string, qr: string, open?: boolean) {
    return (
      <Card>
        <h4 className="font-black">{title}</h4>
        <p className="mt-1 text-xs leading-5 reserve-muted">{description}</p>
        {qr ? (
          <img
            src={qr}
            alt={`${title} QR code`}
            className="mt-3 h-36 w-36 rounded-xl bg-white p-2"
          />
        ) : (
          <div className="mt-3 grid h-36 w-36 place-items-center rounded-xl border border-dashed border-white/15 text-center text-xs reserve-muted">
            QR code not created yet
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {open && url ? (
            <Link
              href={url}
              target="_blank"
              className="reserve-primary rounded-full px-3 py-2 text-xs font-black"
            >
              Open page
            </Link>
          ) : null}
          {url ? (
            <button
              onClick={() => navigator.clipboard?.writeText(url)}
              className="reserve-soft rounded-full px-3 py-2 text-xs font-black"
            >
              Copy link
            </button>
          ) : null}
          {qr ? (
            <>
              <a
                href={qr}
                download
                className="reserve-soft rounded-full px-3 py-2 text-xs font-black"
              >
                Save QR code
              </a>
              <button
                onClick={() => window.print()}
                className="reserve-soft rounded-full px-3 py-2 text-xs font-black"
              >
                Print
              </button>
            </>
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <div>
      <h3 className="text-xl font-black">QR codes</h3>
      <p className="mt-1 text-sm leading-6 reserve-muted">
        Give guests a quick way to open your booking page or public location page from printed materials and on-site signs.
      </p>
      <button
        onClick={generateMissing}
        disabled={!data?.access?.permissions?.manageQrCodes}
        className="reserve-primary mt-4 rounded-full px-4 py-2.5 text-sm font-black disabled:opacity-50"
      >
        Create missing QR codes
      </button>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {qrCard(
          "Reservations",
          "Send guests directly to your reservation page.",
          data?.bookingUrl,
          data?.bookingQr,
          true,
        )}
        {qrCard(
          "Claim this business",
          "Use this when ownership verification is needed for the location.",
          data?.claimUrl,
          data?.claimQr,
        )}
        {qrCard(
          "Public location page",
          "Send guests to your full TheOutHaven location page.",
          data?.publicLocationUrl,
          data?.publicQr,
          true,
        )}
      </div>

      {(data?.tables || []).length ? (
        <>
          <h4 className="mt-6 font-black">Table & space QR codes</h4>
          <p className="mt-1 text-sm reserve-muted">
            Codes created for individual tables, rooms, lanes, or other reservable spaces.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.tables || []).map((table: any) =>
              qrCard(table.name, "On-site code for this space.", table.url, table.qr),
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function ReserveHoursSettings({ locationId }: { locationId: string }) {
  const params = new URLSearchParams({ locationId });
  return (
    <div>
      <h3 className="text-xl font-black">Hours & availability</h3>
      <p className="mt-1 max-w-2xl text-sm leading-6 reserve-muted">
        Reservation hours, party limits, guest capacity, and booking windows are managed together in the Reservation Settings workspace.
      </p>
      <Link
        href={`/locations/dashboard/reservations/settings?${params.toString()}&section=hours`}
        className="reserve-primary mt-4 inline-flex rounded-full px-4 py-2.5 text-sm font-black"
      >
        Open hours & availability
      </Link>
    </div>
  );
}

export function ReserveTeamSettings({ locationId }: { locationId: string }) {
  const [data, setData] = useState<any>();
  const [form, setForm] = useState<any>({ role: "view_only", permissions: {} });
  const [notice, setNotice] = useState("");

  const load = () =>
    locationId &&
    fetch(`/api/reserve/portal/team?locationId=${encodeURIComponent(locationId)}`)
      .then((response) => response.json())
      .then(setData);

  useEffect(() => {
    void load();
  }, [locationId]);

  const canManage = Boolean(data?.access?.permissions?.manageTeam);

  async function invite() {
    setNotice("");
    const response = await fetch("/api/reserve/portal/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId, ...form }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setNotice(payload.error || "We could not send this invitation.");
      return;
    }
    setNotice("Invitation sent.");
    setForm({ role: "view_only", permissions: {} });
    await load();
  }

  function permissionLabels(member: any) {
    const enabled = Object.entries(member.permissions || {})
      .filter(([, value]) => Boolean(value))
      .map(([key]) =>
        PERMISSIONS.find(([permission]) => permission === key)?.[1],
      )
      .filter(Boolean);
    return enabled.length ? enabled.join(" · ") : "View only";
  }

  return (
    <div>
      <h3 className="text-xl font-black">Team access</h3>
      <p className="mt-1 text-sm leading-6 reserve-muted">
        Give each team member only the reservation access they need for their role.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <h4 className="font-black">People with access</h4>
          {(data?.members || []).length ? (
            <div className="mt-3 space-y-3">
              {(data?.members || []).map((member: any) => (
                <div
                  key={member.id}
                  className="rounded-2xl border border-white/10 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-black">{member.name || member.email}</p>
                      <p className="mt-0.5 text-sm reserve-muted">{member.email}</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-black">
                      {INVITE_LABELS[member.invitation_status] || "Active"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-bold text-white/70">
                    {ROLE_LABELS[member.role] || "Team member"}
                  </p>
                  <p className="mt-1 text-xs leading-5 reserve-muted">
                    {permissionLabels(member)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm reserve-muted">
              No additional team members have been added yet.
            </p>
          )}
        </Card>

        <Card>
          <h4 className="font-black">Invite a team member</h4>
          <label className="mt-3 block text-xs font-bold">
            Email address
            <input
              disabled={!canManage}
              type="email"
              placeholder="name@company.com"
              value={form.email || ""}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              className="reserve-soft mt-1 w-full rounded-xl px-3 py-2.5"
            />
          </label>
          <label className="mt-3 block text-xs font-bold">
            Name <span className="reserve-muted">(optional)</span>
            <input
              disabled={!canManage}
              placeholder="Team member name"
              value={form.name || ""}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="reserve-soft mt-1 w-full rounded-xl px-3 py-2.5"
            />
          </label>
          <label className="mt-3 block text-xs font-bold">
            Role
            <select
              disabled={!canManage}
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
              className="reserve-soft mt-1 w-full rounded-xl px-3 py-2.5"
            >
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-4">
            <p className="text-xs font-black">What they can do</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {PERMISSIONS.map(([permission, label]) => (
                <label
                  key={permission}
                  className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs"
                >
                  <input
                    disabled={!canManage}
                    type="checkbox"
                    checked={Boolean(form.permissions?.[permission])}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        permissions: {
                          ...form.permissions,
                          [permission]: event.target.checked,
                        },
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <button
            disabled={!canManage || !form.email}
            onClick={invite}
            className="reserve-primary mt-4 w-full rounded-full px-4 py-2.5 text-sm font-black disabled:opacity-50"
          >
            Send invitation
          </button>
          {notice ? <p className="mt-3 text-sm font-bold">{notice}</p> : null}
          {!canManage ? (
            <p className="mt-3 text-sm reserve-muted">
              You can view team access, but your role cannot change it.
            </p>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
