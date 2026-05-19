"use client";

import { useState } from "react";

type Props = {
  locationId: string;
  initial: any;
};

export default function ClaimQrCode({ locationId, initial }: Props) {
  const [data, setData] = useState<any>(initial || null);
  const [loading, setLoading] = useState(false);

  const run = async (method: "POST" | "PATCH") => {
    setLoading(true);
    const res = await fetch(`/api/admin/locations/${locationId}/claim-code`, { method });
    const json = await res.json();
    if (json?.claim) setData(json.claim);
    setLoading(false);
  };

  if (!data?.claim_code) {
    return <button className="rounded bg-black px-3 py-2 text-white" onClick={() => run("POST")}>Create Claim Code</button>;
  }

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <div><p className="text-xs text-neutral-500">Claim code</p><p className="font-semibold">{data.claim_code}</p></div>
        <div><p className="text-xs text-neutral-500">Status</p><p className="font-semibold">{data.claim_status || "unclaimed"}</p></div>
      </div>
      {data.claim_qr_url ? <img src={data.claim_qr_url} alt="Claim QR" className="h-48 w-48 rounded border" /> : null}
      <p className="truncate text-sm">{data.claim_url}</p>
      <div className="flex gap-2">
        <button className="rounded border px-3 py-1" onClick={() => navigator.clipboard.writeText(data.claim_code || "")}>Copy code</button>
        <button className="rounded border px-3 py-1" onClick={() => navigator.clipboard.writeText(data.claim_url || "")}>Copy link</button>
        <button disabled={loading} className="rounded border px-3 py-1" onClick={() => run("PATCH")}>Regenerate</button>
      </div>
    </div>
  );
}
