"use client";

import { useEffect, useMemo, useState } from "react";

function dollars(cents: unknown) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function cents(value: string) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100)) : 0;
}

export default function ReserveLargeGroupSettings({
  locationId,
}: {
  locationId: string;
}) {
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  async function load() {
    if (!locationId) return;
    const response = await fetch(
      `/api/reserve/portal/large-group-settings?locationId=${encodeURIComponent(locationId)}`,
      { cache: "no-store" },
    );
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "We could not load reservation policies.");
    }
    setData(payload);
    setForm(payload.location);
  }

  useEffect(() => {
    void load().catch((error) =>
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "We could not load reservation policies.",
      }),
    );
  }, [locationId]);

  const depositPreview = useMemo(() => {
    if (!form || form.large_group_payment_mode !== "deposit") return null;
    const label =
      form.large_group_deposit_type === "per_person" ? "per guest" : "per reservation";
    return `$${dollars(form.large_group_deposit_amount_cents)} ${label}`;
  }, [form]);

  if (!locationId) {
    return <p className="reserve-muted text-sm">Choose a location to manage policies.</p>;
  }
  if (!form) {
    return <p className="reserve-muted text-sm">Loading reservation policies…</p>;
  }

  function set(key: string, value: unknown) {
    setForm((current: any) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/reserve/portal/large-group-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, ...form }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "We could not save reservation policies.");
      }
      setData(payload);
      setForm(payload.location);
      setMessage({ tone: "success", text: "Reservation policies saved." });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "We could not save reservation policies.",
      });
    } finally {
      setSaving(false);
    }
  }

  const input = "reserve-soft mt-1 w-full rounded-xl px-3 py-2.5";

  return (
    <div className="space-y-5">
      <section className="reserve-card rounded-[2rem] p-5 sm:p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff8aa0]">
          Guest policies
        </p>
        <h1 className="mt-1 text-2xl font-black">Cancellation, no-show & card protection</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 reserve-muted">
          Set the rules guests agree to when they reserve. A guest keeps the policy they accepted for that reservation even if you change your defaults later.
        </p>
      </section>

      <section className="reserve-card rounded-[2rem] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black">Standard reservations</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 reserve-muted">
              Choose how much notice guests need to cancel, the arrival grace period, and any charge for late cancellations or no-shows.
            </p>
          </div>
          <label className="reserve-soft flex items-center gap-3 rounded-full px-4 py-3 text-sm font-black">
            <input
              type="checkbox"
              checked={Boolean(form.reservation_guarantee_enabled)}
              onChange={(event) =>
                set("reservation_guarantee_enabled", event.target.checked)
              }
            />
            Require a card guarantee
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-bold">
            Free cancellation until
            <input
              className={input}
              type="number"
              min="0"
              max="168"
              value={form.reservation_cancel_cutoff_hours ?? 6}
              onChange={(event) =>
                set("reservation_cancel_cutoff_hours", Number(event.target.value))
              }
            />
            <span className="mt-1 block text-[10px] reserve-muted">hours before arrival</span>
          </label>

          <label className="text-xs font-bold">
            Arrival grace period
            <input
              className={input}
              type="number"
              min="0"
              max="180"
              value={form.reservation_no_show_grace_minutes ?? 15}
              onChange={(event) =>
                set("reservation_no_show_grace_minutes", Number(event.target.value))
              }
            />
            <span className="mt-1 block text-[10px] reserve-muted">minutes</span>
          </label>

          <label className="text-xs font-bold">
            Late-cancellation charge
            <select
              className={input}
              value={form.reservation_late_cancel_fee_type || "per_person"}
              onChange={(event) =>
                set("reservation_late_cancel_fee_type", event.target.value)
              }
            >
              <option value="flat">One amount per reservation</option>
              <option value="per_person">Amount per guest</option>
            </select>
            <div className="relative mt-2">
              <span className="pointer-events-none absolute left-3 top-2.5 text-sm reserve-muted">$</span>
              <input
                className="reserve-soft w-full rounded-xl py-2.5 pl-7 pr-3"
                type="number"
                min="0"
                step="1"
                value={dollars(form.reservation_late_cancel_fee_cents ?? 1000)}
                onChange={(event) =>
                  set("reservation_late_cancel_fee_cents", cents(event.target.value))
                }
              />
            </div>
          </label>

          <label className="text-xs font-bold">
            No-show charge
            <select
              className={input}
              value={form.reservation_no_show_fee_type || "per_person"}
              onChange={(event) =>
                set("reservation_no_show_fee_type", event.target.value)
              }
            >
              <option value="flat">One amount per reservation</option>
              <option value="per_person">Amount per guest</option>
            </select>
            <div className="relative mt-2">
              <span className="pointer-events-none absolute left-3 top-2.5 text-sm reserve-muted">$</span>
              <input
                className="reserve-soft w-full rounded-xl py-2.5 pl-7 pr-3"
                type="number"
                min="0"
                step="1"
                value={dollars(form.reservation_no_show_fee_cents ?? 2000)}
                onChange={(event) =>
                  set("reservation_no_show_fee_cents", cents(event.target.value))
                }
              />
            </div>
          </label>
        </div>

        {!data?.stripeReady && form.reservation_guarantee_enabled ? (
          <div className="mt-4 rounded-xl border border-[#e1062a]/25 bg-[#e1062a]/10 p-3 text-xs font-bold text-white/80">
            You can save this policy now. Complete TheOutHaven Payments setup before card guarantees can be collected from guests.
          </div>
        ) : null}
      </section>

      <section className="reserve-card rounded-[2rem] p-5 sm:p-6">
        <h2 className="text-lg font-black">Large-party policies</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 reserve-muted">
          Large parties can use different cancellation and no-show rules from standard reservations.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-bold">
            Free cancellation until
            <input
              className={input}
              type="number"
              min="0"
              max="336"
              value={form.large_group_cancel_cutoff_hours ?? 24}
              onChange={(event) =>
                set("large_group_cancel_cutoff_hours", Number(event.target.value))
              }
            />
            <span className="mt-1 block text-[10px] reserve-muted">hours before arrival</span>
          </label>

          <label className="text-xs font-bold">
            Arrival grace period
            <input
              className={input}
              type="number"
              min="0"
              max="180"
              value={form.large_group_no_show_grace_minutes ?? 15}
              onChange={(event) =>
                set("large_group_no_show_grace_minutes", Number(event.target.value))
              }
            />
            <span className="mt-1 block text-[10px] reserve-muted">minutes</span>
          </label>

          <label className="text-xs font-bold">
            Late-cancellation charge
            <select
              className={input}
              value={form.large_group_late_cancel_fee_type || "per_person"}
              onChange={(event) =>
                set("large_group_late_cancel_fee_type", event.target.value)
              }
            >
              <option value="flat">One amount per reservation</option>
              <option value="per_person">Amount per guest</option>
            </select>
            <div className="relative mt-2">
              <span className="pointer-events-none absolute left-3 top-2.5 text-sm reserve-muted">$</span>
              <input
                className="reserve-soft w-full rounded-xl py-2.5 pl-7 pr-3"
                type="number"
                min="0"
                step="1"
                value={dollars(form.large_group_late_cancel_fee_cents ?? 2500)}
                onChange={(event) =>
                  set("large_group_late_cancel_fee_cents", cents(event.target.value))
                }
              />
            </div>
          </label>

          <label className="text-xs font-bold">
            No-show charge
            <select
              className={input}
              value={form.large_group_no_show_fee_type || "per_person"}
              onChange={(event) =>
                set("large_group_no_show_fee_type", event.target.value)
              }
            >
              <option value="flat">One amount per reservation</option>
              <option value="per_person">Amount per guest</option>
            </select>
            <div className="relative mt-2">
              <span className="pointer-events-none absolute left-3 top-2.5 text-sm reserve-muted">$</span>
              <input
                className="reserve-soft w-full rounded-xl py-2.5 pl-7 pr-3"
                type="number"
                min="0"
                step="1"
                value={dollars(form.large_group_no_show_fee_cents ?? 5000)}
                onChange={(event) =>
                  set("large_group_no_show_fee_cents", cents(event.target.value))
                }
              />
            </div>
          </label>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="reserve-card rounded-[2rem] p-5 sm:p-6">
          <h2 className="text-lg font-black">Large-party size & timing</h2>
          <p className="mt-1 text-sm reserve-muted">
            Define which reservations count as a large party and how long they normally stay.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold">
              Starts at
              <input
                className={input}
                type="number"
                min="2"
                max="500"
                value={form.large_group_min_party_size ?? 8}
                onChange={(event) =>
                  set("large_group_min_party_size", Number(event.target.value))
                }
              />
              <span className="mt-1 block text-[10px] reserve-muted">guests</span>
            </label>
            <label className="text-xs font-bold">
              Largest party accepted
              <input
                className={input}
                type="number"
                min={form.large_group_min_party_size || 2}
                max="500"
                value={form.large_group_max_party_size ?? 40}
                onChange={(event) =>
                  set("large_group_max_party_size", Number(event.target.value))
                }
              />
              <span className="mt-1 block text-[10px] reserve-muted">guests</span>
            </label>
            <label className="text-xs font-bold">
              Standard length
              <input
                className={input}
                type="number"
                min="30"
                step="15"
                max="1440"
                value={form.large_group_default_duration_minutes ?? 180}
                onChange={(event) =>
                  set(
                    "large_group_default_duration_minutes",
                    Number(event.target.value),
                  )
                }
              />
              <span className="mt-1 block text-[10px] reserve-muted">minutes</span>
            </label>
            <label className="text-xs font-bold">
              Confirmation
              <select
                className={input}
                value={form.large_group_confirmation_mode || "approval"}
                onChange={(event) =>
                  set("large_group_confirmation_mode", event.target.value)
                }
              >
                <option value="instant">Confirm immediately</option>
                <option value="approval">Staff approval</option>
              </select>
            </label>
          </div>
          <label className="reserve-soft mt-4 flex items-center gap-3 rounded-full px-4 py-3 text-sm font-black">
            <input
              type="checkbox"
              checked={Boolean(form.large_group_booking_enabled)}
              onChange={(event) =>
                set("large_group_booking_enabled", event.target.checked)
              }
            />
            Accept large-party reservations
          </label>
        </section>

        <section className="reserve-card rounded-[2rem] p-5 sm:p-6">
          <h2 className="text-lg font-black">Group menu</h2>
          <p className="mt-1 text-sm leading-6 reserve-muted">
            Decide whether large parties must choose a fixed-price group menu when they reserve.
          </p>
          <label className="mt-4 block text-xs font-bold">
            Group-menu requirement
            <select
              className={input}
              value={form.large_group_prix_fixe_mode || "optional"}
              onChange={(event) =>
                set("large_group_prix_fixe_mode", event.target.value)
              }
            >
              <option value="none">Not offered</option>
              <option value="optional">Optional</option>
              <option value="required">Required</option>
            </select>
          </label>
        </section>
      </div>

      <section className="reserve-card rounded-[2rem] p-5 sm:p-6">
        <h2 className="text-lg font-black">Payment requirement for large parties</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 reserve-muted">
          Choose whether a large party needs no payment, a saved card to protect the reservation, or an actual deposit.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-xs font-bold">
            Requirement
            <select
              className={input}
              value={form.large_group_payment_mode || "none"}
              onChange={(event) =>
                set("large_group_payment_mode", event.target.value)
              }
            >
              <option value="none">No payment or card required</option>
              <option value="card_guarantee">Card guarantee</option>
              <option value="deposit">Deposit</option>
            </select>
          </label>

          {form.large_group_payment_mode === "deposit" ? (
            <>
              <label className="text-xs font-bold">
                Deposit type
                <select
                  className={input}
                  value={form.large_group_deposit_type || "flat"}
                  onChange={(event) =>
                    set("large_group_deposit_type", event.target.value)
                  }
                >
                  <option value="flat">One amount per reservation</option>
                  <option value="per_person">Amount per guest</option>
                </select>
              </label>
              <label className="text-xs font-bold">
                Deposit amount
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3 top-2.5 text-sm reserve-muted">$</span>
                  <input
                    className="reserve-soft w-full rounded-xl py-2.5 pl-7 pr-3"
                    type="number"
                    min="0.50"
                    step="0.50"
                    value={dollars(form.large_group_deposit_amount_cents)}
                    onChange={(event) =>
                      set("large_group_deposit_amount_cents", cents(event.target.value))
                    }
                  />
                </div>
              </label>
            </>
          ) : null}
        </div>

        {["deposit", "card_guarantee"].includes(form.large_group_payment_mode) ? (
          <div
            className={`mt-4 rounded-xl border p-3 text-xs font-bold ${
              data?.stripeReady
                ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                : "border-[#e1062a]/25 bg-[#e1062a]/10 text-white/80"
            }`}
          >
            {data?.stripeReady
              ? form.large_group_payment_mode === "deposit"
                ? `Payments are ready. Guests will pay ${depositPreview} to secure the reservation.`
                : "Payments are ready. Guests can secure the reservation with a saved card, and your cancellation/no-show policy applies if needed."
              : "Complete TheOutHaven Payments setup before this payment requirement can be used with guests."}
          </div>
        ) : null}
      </section>

      {message ? (
        <div
          className={`rounded-xl border p-3 text-sm font-bold ${
            message.tone === "success"
              ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
              : "border-rose-300/20 bg-rose-300/10 text-rose-100"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="reserve-primary rounded-full px-5 py-3 text-sm font-black disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save policies"}
      </button>
    </div>
  );
}
