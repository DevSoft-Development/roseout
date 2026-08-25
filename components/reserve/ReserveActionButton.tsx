import Link from "next/link";
import type { ReactNode } from "react";

const className =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black text-white shadow-[0_10px_24px_rgba(225,6,42,.2)] transition hover:bg-[#c80526] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";

export default function ReserveActionButton({
  href,
  children,
  onClick,
  disabled,
}: {
  href?: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  );
}
