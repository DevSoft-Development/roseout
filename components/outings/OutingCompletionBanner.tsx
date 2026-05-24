"use client";

export function OutingCompletionBanner({
  visible,
  onComplete,
  onNotYet,
  onCancel,
}: {
  visible: boolean;
  onComplete: () => void;
  onNotYet: () => void;
  onCancel: () => void;
}) {
  if (!visible) return null;

  return (
    <div className="mt-3 rounded-xl border border-[#e1062a]/35 bg-[#1a0c10] p-3 md:fixed md:bottom-5 md:right-5 md:z-40 md:w-[360px] md:shadow-2xl md:shadow-black/50">
      <p className="text-sm font-black text-white">Did you complete this outing?</p>
      <div className="mt-2 grid grid-cols-1 gap-2">
        <button
          className="w-full rounded-full bg-[#e1062a] px-4 py-3 text-sm font-black text-white"
          onClick={onComplete}
        >
          Mark Outing Complete
        </button>
        <button
          className="w-full rounded-full border border-white/20 px-4 py-3 text-sm font-black text-white/85"
          onClick={onNotYet}
        >
          Not Yet
        </button>
        <button
          className="w-full rounded-full border border-white/20 px-4 py-3 text-sm font-black text-white/85"
          onClick={onCancel}
        >
          Cancel Outing
        </button>
      </div>
    </div>
  );
}
