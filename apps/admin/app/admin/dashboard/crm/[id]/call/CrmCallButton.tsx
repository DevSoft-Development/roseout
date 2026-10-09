"use client";

export default function CrmCallButton({
  locationId,
  callHref,
  phone,
}: {
  locationId: string;
  callHref: string;
  phone: string;
}) {
  function logCallStart() {
    const payload = JSON.stringify({ locationId, phone });

    try {
      if (navigator.sendBeacon) {
        const body = new Blob([payload], { type: "application/json" });
        const queued = navigator.sendBeacon("/api/admin/crm/calls/initiate", body);
        if (queued) return;
      }
    } catch {
      // Fall through to keepalive fetch.
    }

    void fetch("/api/admin/crm/calls/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => undefined);
  }

  return (
    <a
      href={callHref}
      onClick={logCallStart}
      className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/30"
    >
      Call now
    </a>
  );
}
