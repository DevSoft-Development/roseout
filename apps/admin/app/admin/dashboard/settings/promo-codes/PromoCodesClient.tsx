"use client";

import { useEffect, useMemo, useState } from "react";

type Audience = "users" | "locations" | "both";
type PromoType =
  | "premium_access"
  | "search_boost"
  | "location_pro_trial"
  | "discount";
type TargetScope =
  | "any"
  | "specific_user"
  | "specific_location"
  | "signup_user"
  | "signup_location_owner";
type DiscountMode = "none" | "percent" | "amount";

type Promo = {
  id: string;
  code: string;
  name: string | null;
  description: string | null;
  audience: Audience;
  promo_type: PromoType;
  target_scope: TargetScope;
  plan_granted: string | null;
  is_active: boolean;
  redemption_count: number;
  max_redemptions: number | null;
  starts_at: string;
  expires_at: string | null;
  created_at: string;
};

type PromoFormState = {
  code: string;
  prefix: string;
  name: string;
  description: string;
  internal_notes: string;
  audience: Audience;
  target_scope: TargetScope;
  assigned_user_id: string;
  assigned_location_id: string;
  assigned_location_name: string;
  promo_type: PromoType;
  plan_granted: string;
  duration_days: string;
  search_limit_override: string;
  discount_mode: DiscountMode;
  discount_percent: string;
  discount_amount: string;
  max_redemptions: string;
  max_redemptions_per_user: string;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
};

type UserOption = {
  id: string;
  email: string | null;
};

type LocationOption = {
  id: string;
  name: string | null;
  address: string | null;
  neighborhood?: string | null;
  borough?: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");

function toDatetimeLocal(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

const initialForm: PromoFormState = {
  code: "",
  prefix: "OUT",
  name: "",
  description: "",
  internal_notes: "",
  audience: "users",
  target_scope: "any",
  assigned_user_id: "",
  assigned_location_id: "",
  assigned_location_name: "",
  promo_type: "premium_access",
  plan_granted: "premium",
  duration_days: "30",
  search_limit_override: "",
  discount_mode: "none",
  discount_percent: "",
  discount_amount: "",
  max_redemptions: "",
  max_redemptions_per_user: "1",
  starts_at: toDatetimeLocal(new Date()),
  expires_at: toDatetimeLocal(addDays(30)),
  is_active: true,
};

const promoPresets: Array<{
  key: PromoType;
  title: string;
  description: string;
  audience: Audience;
  target_scope: TargetScope;
  prefix: string;
  plan_granted: string;
  duration_days: string;
}> = [
  {
    key: "premium_access",
    title: "User free premium",
    description: "Give a user temporary premium access.",
    audience: "users",
    target_scope: "any",
    prefix: "USER",
    plan_granted: "premium",
    duration_days: "30",
  },
  {
    key: "location_pro_trial",
    title: "Location owner trial",
    description: "Give a location owner a free pro trial.",
    audience: "locations",
    target_scope: "any",
    prefix: "OWNER",
    plan_granted: "location_pro",
    duration_days: "30",
  },
  {
    key: "discount",
    title: "Subscription discount",
    description: "Create a percent or dollar discount code.",
    audience: "both",
    target_scope: "any",
    prefix: "SAVE",
    plan_granted: "",
    duration_days: "30",
  },
  {
    key: "search_boost",
    title: "Search boost",
    description: "Give extra search or discovery benefits.",
    audience: "locations",
    target_scope: "any",
    prefix: "BOOST",
    plan_granted: "search_boost",
    duration_days: "30",
  },
];

const fieldClass =
  "h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-rose-400/50 focus:bg-white/[0.07]";

const selectClass =
  "h-12 w-full appearance-none rounded-2xl border border-white/10 bg-[#160d0c] px-4 text-sm text-white outline-none transition focus:border-rose-400/50";

const labelClass = "mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-white/45";

function formatDate(value: string | null) {
  if (!value) return "No expiration";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusFor(promo: Promo) {
  const now = Date.now();

  if (!promo.is_active) return "Inactive";
  if (
    promo.max_redemptions !== null &&
    promo.redemption_count >= promo.max_redemptions
  ) {
    return "Used up";
  }
  if (new Date(promo.starts_at).getTime() > now) return "Scheduled";
  if (promo.expires_at && new Date(promo.expires_at).getTime() < now) {
    return "Expired";
  }

  return "Active";
}

function badgeClass(status: string) {
  if (status === "Active") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  }

  if (status === "Expired" || status === "Used up" || status === "Inactive") {
    return "border-rose-400/20 bg-rose-400/10 text-rose-200";
  }

  return "border-amber-400/20 bg-amber-400/10 text-amber-200";
}

export default function AdminPromoCodesPage() {
  const [items, setItems] = useState<Promo[]>([]);
  const [form, setForm] = useState<PromoFormState>(initialForm);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [filters, setFilters] = useState({
    q: "",
    audience: "",
    promo_type: "",
    status: "",
  });

  const [userSearch, setUserSearch] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);

  const load = async () => {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    const res = await fetch(`/api/admin/promo-codes?${params.toString()}`);
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Failed to load promo codes.");
      return;
    }

    setItems(data.promo_codes || []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (form.target_scope !== "specific_user" || userSearch.trim().length < 2) {
        setUserOptions([]);
        return;
      }

      const res = await fetch(
        `/api/admin/promo-codes?lookup=users&q=${encodeURIComponent(userSearch)}`,
      );
      const data = await res.json();

      if (res.ok) setUserOptions(data.users || []);
    }, 300);

    return () => clearTimeout(timer);
  }, [form.target_scope, userSearch]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (
        form.target_scope !== "specific_location" ||
        locationSearch.trim().length < 2
      ) {
        setLocationOptions([]);
        return;
      }

      const res = await fetch(
        `/api/admin/promo-codes?lookup=locations&q=${encodeURIComponent(
          locationSearch,
        )}`,
      );
      const data = await res.json();

      if (res.ok) setLocationOptions(data.locations || []);
    }, 300);

    return () => clearTimeout(timer);
  }, [form.target_scope, locationSearch]);

  const summary = useMemo(() => {
    const now = Date.now();

    return {
      total: items.length,
      active: items.filter((item) => statusFor(item) === "Active").length,
      redemptions: items.reduce(
        (total, item) => total + (item.redemption_count || 0),
        0,
      ),
      expired: items.filter(
        (item) => item.expires_at && new Date(item.expires_at).getTime() < now,
      ).length,
    };
  }, [items]);

  const selectedPreset =
    promoPresets.find((preset) => preset.key === form.promo_type) ||
    promoPresets[0];

  const applyPreset = (preset: (typeof promoPresets)[number]) => {
    setForm((current) => ({
      ...current,
      promo_type: preset.key,
      audience: preset.audience,
      target_scope: preset.target_scope,
      prefix: preset.prefix,
      plan_granted: preset.plan_granted,
      duration_days: preset.duration_days,
      discount_mode: preset.key === "discount" ? "percent" : "none",
      discount_percent: preset.key === "discount" ? "20" : "",
      discount_amount: "",
      name: current.name || preset.title,
      description: current.description || preset.description,
      code: "",
    }));
    setMsg("");
    setError("");
  };

  const generateCode = async () => {
    setGenerating(true);
    setError("");
    setMsg("");

    try {
      const res = await fetch("/api/admin/promo-codes/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefix: form.prefix }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Could not generate a promo code.");
        return;
      }

      setForm((current) => ({
        ...current,
        code: data.code,
      }));
    } catch {
      setError("Could not generate a promo code.");
    } finally {
      setGenerating(false);
    }
  };

  const validate = () => {
    if (!form.code.trim()) return "Click Generate Code first.";

    if (form.discount_mode === "percent") {
      const percent = Number(form.discount_percent);

      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
        return "Discount percent must be between 1 and 100.";
      }
    }

    if (form.discount_mode === "amount") {
      const amount = Number(form.discount_amount);

      if (!Number.isFinite(amount) || amount <= 0) {
        return "Discount amount must be greater than 0.";
      }
    }

    if (form.target_scope === "specific_user" && !form.assigned_user_id) {
      return "Choose the user who can use this promo code.";
    }

    if (form.target_scope === "specific_location" && !form.assigned_location_id) {
      return "Choose the location this promo code belongs to.";
    }

    if (
      form.expires_at &&
      form.starts_at &&
      new Date(form.expires_at).getTime() <= new Date(form.starts_at).getTime()
    ) {
      return "Expiration must be after the start date.";
    }

    return "";
  };

  const create = async () => {
    setMsg("");
    setError("");

    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    const payload = {
      ...form,
      auto_generated: false,
      discount_percent:
        form.discount_mode === "percent" ? form.discount_percent : "",
      discount_amount: form.discount_mode === "amount" ? form.discount_amount : "",
      search_limit_override:
        form.search_limit_override === "unlimited"
          ? ""
          : form.search_limit_override,
    };

    try {
      const res = await fetch("/api/admin/promo-codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create promo code.");
        return;
      }

      setMsg(`Promo code ${data.promo_code?.code || form.code} was created.`);
      setForm({
        ...initialForm,
        prefix: form.prefix,
        audience: form.audience,
        promo_type: form.promo_type,
      });
      setUserSearch("");
      setLocationSearch("");
      setUserOptions([]);
      setLocationOptions([]);

      await load();
    } catch {
      setError("Failed to create promo code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-24 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-rose-300">
              Admin / Billing
            </p>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              Promo Codes
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/60">
              Create simple promo codes for users, location owners, free trials,
              subscription discounts, and special access.
            </p>
          </div>

          <button
            type="button"
            onClick={generateCode}
            disabled={generating}
            className="rounded-2xl bg-gradient-to-r from-rose-600 to-pink-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/40 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? "Generating..." : "Generate Code"}
          </button>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">
              Total
            </p>
            <p className="mt-3 text-3xl font-black">{summary.total}</p>
          </div>

          <div className="rounded-3xl border border-emerald-400/15 bg-emerald-400/[0.05] p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">
              Active
            </p>
            <p className="mt-3 text-3xl font-black">{summary.active}</p>
          </div>

          <div className="rounded-3xl border border-rose-400/15 bg-rose-400/[0.05] p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">
              Redemptions
            </p>
            <p className="mt-3 text-3xl font-black">{summary.redemptions}</p>
          </div>

          <div className="rounded-3xl border border-amber-400/15 bg-amber-400/[0.05] p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">
              Expired
            </p>
            <p className="mt-3 text-3xl font-black">{summary.expired}</p>
          </div>
        </section>

        {msg && (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {msg}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        <section className="rounded-[32px] border border-white/10 bg-white/[0.025] p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">
                Create
              </p>
              <h2 className="mt-1 text-2xl font-black">New promo code</h2>
              <p className="mt-1 text-sm text-white/50">
                Pick a purpose first. The form adjusts to the kind of code you need.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {promoPresets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`rounded-3xl border p-4 text-left transition ${
                  selectedPreset.key === preset.key
                    ? "border-rose-400/40 bg-rose-400/10"
                    : "border-white/10 bg-black/20 hover:bg-white/[0.05]"
                }`}
              >
                <p className="font-black">{preset.title}</p>
                <p className="mt-1 text-xs leading-5 text-white/50">
                  {preset.description}
                </p>
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-6">
              <div>
                <p className={labelClass}>1. Code details</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-bold text-white/75">
                      Promo code
                    </label>
                    <div className="flex gap-2">
                      <input
                        className={fieldClass}
                        value={form.code}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            code: event.target.value.toUpperCase(),
                          }))
                        }
                        placeholder="Generate or enter a code"
                      />
                      <button
                        type="button"
                        onClick={generateCode}
                        disabled={generating}
                        className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm font-bold hover:bg-white/[0.1] disabled:opacity-50"
                      >
                        Generate
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-white/75">
                      Prefix for generated codes
                    </label>
                    <input
                      className={fieldClass}
                      value={form.prefix}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          prefix: event.target.value.toUpperCase(),
                        }))
                      }
                      placeholder="OUT"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-white/75">
                      Name
                    </label>
                    <input
                      className={fieldClass}
                      value={form.name}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Launch week premium"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-white/75">
                      Internal note
                    </label>
                    <input
                      className={fieldClass}
                      value={form.internal_notes}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          internal_notes: event.target.value,
                        }))
                      }
                      placeholder="Why this code exists"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-bold text-white/75">
                    Description
                  </label>
                  <textarea
                    className="min-h-24 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-rose-400/50 focus:bg-white/[0.07]"
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="What this promotion is for"
                  />
                </div>
              </div>

              <div>
                <p className={labelClass}>2. Who can use it?</p>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-bold text-white/75">
                      Audience
                    </label>
                    <select
                      className={selectClass}
                      value={form.audience}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          audience: event.target.value as Audience,
                        }))
                      }
                    >
                      <option value="users">Users only</option>
                      <option value="locations">Location owners only</option>
                      <option value="both">Users and location owners</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-white/75">
                      Usage rule
                    </label>
                    <select
                      className={selectClass}
                      value={form.target_scope}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          target_scope: event.target.value as TargetScope,
                          assigned_user_id: "",
                          assigned_location_id: "",
                          assigned_location_name: "",
                        }))
                      }
                    >
                      <option value="any">Anyone in this audience</option>
                      <option value="specific_user">One specific user</option>
                      <option value="specific_location">
                        One specific location
                      </option>
                      <option value="signup_user">New user signup only</option>
                      <option value="signup_location_owner">
                        New location owner signup only
                      </option>
                    </select>
                  </div>
                </div>

                {form.target_scope === "specific_user" && (
                  <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.035] p-4">
                    <label className="mb-2 block text-sm font-bold text-white/75">
                      Search user
                    </label>

                    <input
                      className={fieldClass}
                      placeholder="Search by email"
                      value={userSearch}
                      onChange={(event) => setUserSearch(event.target.value)}
                    />

                    <div className="mt-3 grid gap-2">
                      {userOptions.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => {
                            setForm((current) => ({
                              ...current,
                              assigned_user_id: user.id,
                            }));
                            setUserSearch(user.email || user.id);
                          }}
                          className={`rounded-2xl border p-3 text-left text-sm transition ${
                            form.assigned_user_id === user.id
                              ? "border-rose-400/50 bg-rose-400/10"
                              : "border-white/10 bg-black/20 hover:bg-white/[0.05]"
                          }`}
                        >
                          <p className="font-bold">{user.email || "User account"}</p>
                          <p className="text-white/50">{user.id}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {form.target_scope === "specific_location" && (
                  <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.035] p-4">
                    <label className="mb-2 block text-sm font-bold text-white/75">
                      Search location
                    </label>

                    <input
                      className={fieldClass}
                      placeholder="Search by location name, address, neighborhood, or borough"
                      value={locationSearch}
                      onChange={(event) => setLocationSearch(event.target.value)}
                    />

                    <div className="mt-3 grid gap-2">
                      {locationOptions.map((location) => (
                        <button
                          key={location.id}
                          type="button"
                          onClick={() => {
                            setForm((current) => ({
                              ...current,
                              assigned_location_id: location.id,
                              assigned_location_name: location.name || "",
                            }));
                            setLocationSearch(location.name || location.address || location.id);
                          }}
                          className={`rounded-2xl border p-3 text-left text-sm transition ${
                            form.assigned_location_id === location.id
                              ? "border-rose-400/50 bg-rose-400/10"
                              : "border-white/10 bg-black/20 hover:bg-white/[0.05]"
                          }`}
                        >
                          <p className="font-bold">
                            {location.name || "Unnamed location"}
                          </p>
                          <p className="text-white/50">
                            {[location.address, location.neighborhood, location.borough]
                              .filter(Boolean)
                              .join(" • ") || location.id}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <p className={labelClass}>3. Benefit</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-bold text-white/75">
                      Benefit type
                    </label>
                    <select
                      className={selectClass}
                      value={form.promo_type}
                      onChange={(event) =>
                        applyPreset(
                          promoPresets.find(
                            (preset) => preset.key === event.target.value,
                          ) || promoPresets[0],
                        )
                      }
                    >
                      <option value="premium_access">Free premium access</option>
                      <option value="location_pro_trial">Location pro trial</option>
                      <option value="discount">Subscription discount</option>
                      <option value="search_boost">Search boost</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-white/75">
                      Duration in days
                    </label>
                    <input
                      className={fieldClass}
                      type="number"
                      min="1"
                      value={form.duration_days}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          duration_days: event.target.value,
                        }))
                      }
                    />
                  </div>

                  {form.promo_type === "discount" && (
                    <>
                      <div>
                        <label className="mb-2 block text-sm font-bold text-white/75">
                          Discount style
                        </label>
                        <select
                          className={selectClass}
                          value={form.discount_mode}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              discount_mode: event.target.value as DiscountMode,
                            }))
                          }
                        >
                          <option value="percent">Percent off</option>
                          <option value="amount">Dollar amount off</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-bold text-white/75">
                          {form.discount_mode === "amount"
                            ? "Amount off"
                            : "Percent off"}
                        </label>
                        <input
                          className={fieldClass}
                          type="number"
                          min="0"
                          max={form.discount_mode === "percent" ? "100" : undefined}
                          step={form.discount_mode === "amount" ? "0.01" : "1"}
                          value={
                            form.discount_mode === "amount"
                              ? form.discount_amount
                              : form.discount_percent
                          }
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              [form.discount_mode === "amount"
                                ? "discount_amount"
                                : "discount_percent"]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </>
                  )}

                  {form.promo_type !== "discount" && (
                    <div>
                      <label className="mb-2 block text-sm font-bold text-white/75">
                        Plan / benefit granted
                      </label>
                      <input
                        className={fieldClass}
                        value={form.plan_granted}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            plan_granted: event.target.value,
                          }))
                        }
                        placeholder="premium"
                      />
                    </div>
                  )}

                  {form.promo_type === "search_boost" && (
                    <div>
                      <label className="mb-2 block text-sm font-bold text-white/75">
                        Search limit override
                      </label>
                      <input
                        className={fieldClass}
                        value={form.search_limit_override}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            search_limit_override: event.target.value,
                          }))
                        }
                        placeholder="Leave blank for plan default"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <p className={labelClass}>4. Limits and dates</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-bold text-white/75">
                      Total redemptions allowed
                    </label>
                    <input
                      className={fieldClass}
                      type="number"
                      min="1"
                      value={form.max_redemptions}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          max_redemptions: event.target.value,
                        }))
                      }
                      placeholder="Unlimited"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-white/75">
                      Per-user limit
                    </label>
                    <input
                      className={fieldClass}
                      type="number"
                      min="1"
                      value={form.max_redemptions_per_user}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          max_redemptions_per_user: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-white/75">
                      Starts
                    </label>
                    <input
                      className={fieldClass}
                      type="datetime-local"
                      value={form.starts_at}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          starts_at: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-white/75">
                      Expires
                    </label>
                    <input
                      className={fieldClass}
                      type="datetime-local"
                      value={form.expires_at}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          expires_at: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <label className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-bold text-white/75">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        is_active: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-rose-500"
                  />
                  Promo code is active
                </label>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">
                  Preview
                </p>
                <p className="mt-3 font-mono text-2xl font-black tracking-wider text-rose-200">
                  {form.code || "YOURCODE"}
                </p>
                <p className="mt-3 text-sm font-bold">
                  {form.name || selectedPreset.title}
                </p>
                <p className="mt-1 text-sm leading-6 text-white/55">
                  {form.description || selectedPreset.description}
                </p>

                <dl className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-white/45">Audience</dt>
                    <dd className="text-right font-bold">{form.audience}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-white/45">Rule</dt>
                    <dd className="text-right font-bold">{form.target_scope}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-white/45">Benefit</dt>
                    <dd className="text-right font-bold">{form.promo_type}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-white/45">Expires</dt>
                    <dd className="text-right font-bold">
                      {form.expires_at ? formatDate(form.expires_at) : "Never"}
                    </dd>
                  </div>
                </dl>

                <button
                  type="button"
                  onClick={create}
                  disabled={loading}
                  className="mt-6 w-full rounded-2xl bg-gradient-to-r from-rose-600 to-pink-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/40 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Creating..." : "Create promo code"}
                </button>
              </div>
            </aside>
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-white/[0.025] p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">
                Library
              </p>
              <h2 className="mt-1 text-2xl font-black">Existing promo codes</h2>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <input
                className={fieldClass}
                value={filters.q}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    q: event.target.value,
                  }))
                }
                placeholder="Search code or name"
              />

              <select
                className={selectClass}
                value={filters.audience}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    audience: event.target.value,
                  }))
                }
              >
                <option value="">All audiences</option>
                <option value="users">Users</option>
                <option value="locations">Locations</option>
                <option value="both">Both</option>
              </select>

              <select
                className={selectClass}
                value={filters.promo_type}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    promo_type: event.target.value,
                  }))
                }
              >
                <option value="">All types</option>
                <option value="premium_access">Premium</option>
                <option value="location_pro_trial">Location pro</option>
                <option value="discount">Discount</option>
                <option value="search_boost">Search boost</option>
              </select>

              <select
                className={selectClass}
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="scheduled">Scheduled</option>
                <option value="expired">Expired</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={load}
              className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-bold hover:bg-white/[0.09]"
            >
              Apply filters
            </button>
          </div>

          <div className="mt-5 grid gap-3">
            {items.length === 0 && (
              <div className="rounded-3xl border border-dashed border-white/10 p-8 text-center text-sm text-white/45">
                No promo codes match these filters.
              </div>
            )}

            {items.map((promo) => {
              const status = statusFor(promo);

              return (
                <div
                  key={promo.id}
                  className="grid gap-4 rounded-3xl border border-white/10 bg-black/20 p-4 md:grid-cols-[1.2fr_1fr_0.8fr_auto] md:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-lg font-black tracking-wider text-rose-200">
                        {promo.code}
                      </p>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${badgeClass(
                          status,
                        )}`}
                      >
                        {status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-bold">
                      {promo.name || "Unnamed promotion"}
                    </p>
                    <p className="mt-1 text-xs text-white/45">
                      {promo.description || promo.promo_type}
                    </p>
                  </div>

                  <div className="text-sm">
                    <p className="font-bold">{promo.promo_type}</p>
                    <p className="mt-1 text-xs text-white/45">
                      {promo.audience} • {promo.target_scope}
                    </p>
                  </div>

                  <div className="text-sm">
                    <p className="font-bold">
                      {promo.redemption_count || 0}
                      {promo.max_redemptions !== null
                        ? ` / ${promo.max_redemptions}`
                        : " redemptions"}
                    </p>
                    <p className="mt-1 text-xs text-white/45">
                      Expires {formatDate(promo.expires_at)}
                    </p>
                  </div>

                  <div className="text-xs text-white/45">
                    Created {formatDate(promo.created_at)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
