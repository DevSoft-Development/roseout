import type { ReactNode } from "react";

export function BusinessPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="business-ui-page-header">
      <div>
        {eyebrow ? <p className="business-ui-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="business-ui-actions">{actions}</div> : null}
    </header>
  );
}

export function BusinessCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`business-ui-card ${className}`}>{children}</section>;
}

export function BusinessSettingsPanel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <BusinessCard className="business-ui-settings-panel">
      <div className="business-ui-settings-copy">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      <div>{children}</div>
    </BusinessCard>
  );
}

export function BusinessButton({
  children,
  variant = "secondary",
  type = "button",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  type?: "button" | "submit";
}) {
  return (
    <button type={type} className={`business-ui-button business-ui-button-${variant}`}>
      {children}
    </button>
  );
}

export function BusinessBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "brand";
}) {
  return <span className={`business-ui-badge is-${tone}`}>{children}</span>;
}

export function BusinessField({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label className="business-ui-field">
      <span>{label}</span>
      {children}
      {help ? <small>{help}</small> : null}
    </label>
  );
}

export function BusinessTableFrame({ children }: { children: ReactNode }) {
  return <div className="business-ui-table-frame">{children}</div>;
}

export function BusinessTabs({ children }: { children: ReactNode }) {
  return <div className="business-ui-tabs" role="tablist">{children}</div>;
}

export function BusinessEmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="business-ui-empty-state">
      <h2>{title}</h2>
      <p>{body}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function BusinessAlert({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
}) {
  return <div className={`business-ui-alert is-${tone}`}>{children}</div>;
}
