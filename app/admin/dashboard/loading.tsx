import Image from "next/image";

export default function AdminDashboardLoading() {
  return (
    <div
      className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-16"
      role="status"
      aria-live="polite"
      aria-label="Loading admin page"
    >
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="relative flex h-24 w-24 items-center justify-center rounded-[2rem] border border-white/10 bg-black/35 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <div className="absolute inset-0 animate-ping rounded-[2rem] border border-rose-400/25" />
          <div className="absolute inset-2 animate-pulse rounded-[1.5rem] bg-rose-500/10" />
          <Image
            src="/toh_logo.png"
            alt="TheOutHaven"
            width={58}
            height={58}
            className="relative z-10 rounded-2xl object-contain"
            priority
          />
        </div>

        <div>
          <p className="text-sm font-black uppercase tracking-[0.24em] text-white/85">TheOutHaven</p>
          <p className="mt-2 text-xs font-semibold text-white/45">Loading admin workspace...</p>
        </div>

        <div className="h-1.5 w-36 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 animate-[pulse_1.1s_ease-in-out_infinite] rounded-full bg-rose-500/80" />
        </div>
      </div>
    </div>
  );
}
