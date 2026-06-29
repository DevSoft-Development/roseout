"use client";

export default function ReserveQuickActionButton({
  children,
  disabled,
  title,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className="inline-flex h-[31px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-[var(--reserve-border)] px-3 text-xs font-black leading-none disabled:cursor-not-allowed disabled:opacity-45 enabled:hover:bg-[var(--reserve-surface-soft)]"
    >
      {children}
    </button>
  );
}
