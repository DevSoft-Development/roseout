"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const ACTIVE_STATUSES = new Set(["pending", "running", "cancelling"]);

export function ProfileRunLiveRefresh({ status }: { status: string }) {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    if (!ACTIVE_STATUSES.has(status)) return;

    const refresh = () => {
      router.refresh();
      setLastRefresh(new Date());
    };

    const interval = window.setInterval(refresh, 3000);
    return () => window.clearInterval(interval);
  }, [router, status]);

  if (!ACTIVE_STATUSES.has(status)) return null;

  return (
    <div className="mt-4 flex items-center gap-2 text-xs font-bold text-emerald-200/80">
      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
      Live progress updates every 3 seconds
      {lastRefresh ? <span className="text-white/35">· refreshed {lastRefresh.toLocaleTimeString()}</span> : null}
    </div>
  );
}
