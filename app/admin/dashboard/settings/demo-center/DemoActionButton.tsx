"use client";
import { useActionState } from "react";
import type { DemoActionState } from "./actions";

const initialState: DemoActionState = { ok: true, message: "" };

type Props = {
  action: (state: DemoActionState, formData: FormData) => Promise<DemoActionState> | DemoActionState;
  label: string;
  pendingLabel?: string;
  hidden?: Record<string, string>;
  variant?: "primary" | "outline";
};

export default function DemoActionButton({ action, label, pendingLabel, hidden, variant = "primary" }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const buttonClass = variant === "outline"
    ? "rounded-full border border-white/10 px-3 py-1 text-xs font-black text-white hover:border-rose-300/50 disabled:cursor-not-allowed disabled:opacity-60"
    : "rounded-full bg-rose-600 px-4 py-2 text-sm font-black text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <form action={formAction} className="inline-flex max-w-sm flex-col items-start gap-2">
      {hidden ? Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />) : null}
      <button className={buttonClass} disabled={pending}>{pending ? pendingLabel || "Working…" : label}</button>
      {state?.message ? (
        <p aria-live="polite" className={`text-xs font-bold ${state.ok ? "text-emerald-200" : "text-amber-200"}`}>
          {state.message}{state.detail ? ` ${state.detail}` : ""}
        </p>
      ) : null}
    </form>
  );
}
