import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

export function SettingsControlCard({
  eyebrow,
  title,
  description,
  meta,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[1.6rem] border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card)] shadow-[0_14px_38px_rgba(0,0,0,0.08)]">
      <div className="border-b border-[var(--admin-shell-border)] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--admin-shell-accent)]">
              {eyebrow}
            </p>
            <h3 className="mt-2 text-xl font-black tracking-[-0.02em] text-[var(--admin-shell-text)]">
              {title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-[var(--admin-shell-soft)]">
              {description}
            </p>
          </div>
          {meta ? (
            <div className="shrink-0 rounded-xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card-strong)] px-3 py-2 text-xs font-black text-[var(--admin-shell-soft)]">
              {meta}
            </div>
          ) : null}
        </div>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

export function SettingsField({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-[var(--admin-shell-text)]">{label}</span>
      {helper ? <span className="mt-1 block text-xs leading-5 text-[var(--admin-shell-muted)]">{helper}</span> : null}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

export function SettingsToggle({
  checked,
  onChange,
  label,
  description,
  danger = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  danger?: boolean;
}) {
  return (
    <label
      className={[
        "flex cursor-pointer items-start justify-between gap-4 rounded-2xl border p-4 transition",
        danger
          ? "border-[var(--admin-shell-accent-border)] bg-[var(--admin-shell-accent-soft)]"
          : "border-[var(--admin-shell-border)] bg-[var(--admin-shell-card-strong)] hover:border-[var(--admin-shell-border-strong)]",
      ].join(" ")}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-black text-[var(--admin-shell-text)]">
          {danger ? <AlertTriangle size={15} className="text-[var(--admin-shell-accent)]" /> : null}
          {label}
        </span>
        {description ? <span className="mt-1 block text-xs leading-5 text-[var(--admin-shell-muted)]">{description}</span> : null}
      </span>
      <span className="relative mt-0.5 inline-flex h-6 w-11 shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="absolute inset-0 rounded-full border border-[var(--admin-shell-border-strong)] bg-[var(--admin-shell-card)] transition peer-checked:border-[var(--admin-shell-accent)] peer-checked:bg-[var(--admin-shell-accent)]" />
        <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-[var(--admin-shell-soft)] transition peer-checked:translate-x-5 peer-checked:bg-white" />
      </span>
    </label>
  );
}

export const settingsInputClass =
  "min-h-11 w-full rounded-xl border border-[var(--admin-shell-border-strong)] bg-[var(--admin-shell-card-strong)] px-3 py-2.5 text-sm font-bold text-[var(--admin-shell-text)] outline-none transition placeholder:text-[var(--admin-shell-muted)] focus:border-[var(--admin-shell-accent-border)] focus:ring-2 focus:ring-[var(--admin-shell-accent-soft)]";

export const settingsPrimaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-transparent bg-[var(--admin-shell-accent)] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[var(--admin-shell-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50";

export const settingsSecondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--admin-shell-border-strong)] bg-[var(--admin-shell-card-strong)] px-4 py-2.5 text-sm font-black text-[var(--admin-shell-text)] transition hover:border-[var(--admin-shell-accent-border)]";
