import Link from "next/link";
import type { ReactNode } from "react";
const cls="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/30 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50";
export default function ReserveActionButton({ href, children, onClick, disabled }: { href?: string; children: ReactNode; onClick?: () => void; disabled?: boolean }) { return href ? <Link href={href} className={cls}>{children}</Link> : <button type="button" onClick={onClick} disabled={disabled} className={cls}>{children}</button>; }
