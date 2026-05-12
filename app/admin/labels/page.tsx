"use client";

import { useEffect, useMemo, useState } from "react";

type LabelLocation = {
  id: string;
  type: "restaurants" | "activities";
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  status: string | null;
  claimed: boolean | null;
  claim_url: string | null;
  qr_code_data_url: string | null;
};

function fullAddress(location: LabelLocation) {
  const lineOne = location.address?.trim();
  const lineTwo = [location.city, location.state, location.zip_code]
    .filter(Boolean)
    .join(", ");

  return [lineOne, lineTwo].filter(Boolean).join("<br />") || "Address not listed";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default function AdminLabelsPage() {
  const [locations, setLocations] = useState<LabelLocation[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLocations() {
      try {
        const res = await fetch("/api/admin/claim-labels", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to load labels.");
        setLocations(data.locations || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load labels.");
      } finally {
        setLoading(false);
      }
    }

    loadLocations();
  }, []);

  const filteredLocations = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return locations;
    return locations.filter((location) =>
      [location.name, location.address, location.city, location.state, location.zip_code, location.type]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(cleanQuery)
    );
  }, [locations, query]);

  const selectedLocations = locations.filter((location) => selectedIds.includes(`${location.type}:${location.id}`));

  const toggleSelect = (location: LabelLocation) => {
    const key = `${location.type}:${location.id}`;
    setSelectedIds((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  const printLabels = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const labelsHtml = selectedLocations
      .map((location) => {
        const safeName = escapeHtml(location.name || "TheOutHaven Location");
        return `
          <article class="label">
            <div class="qr-wrap">
              <img src="${location.qr_code_data_url || ""}" alt="${safeName} QR" />
              <p>Scan to claim</p>
            </div>
            <div class="copy">
              <h2>${safeName}</h2>
              <p class="address">${fullAddress(location)}</p>
              <p class="brand">TheOutHaven Claim Access</p>
            </div>
          </article>
        `;
      })
      .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>TheOutHaven Claim QR Mailer Labels</title>
          <style>
            @page { size: letter; margin: 0.5in; }
            * { box-sizing: border-box; }
            body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #17100d; }
            .sheet { display: grid; grid-template-columns: repeat(2, 4in); grid-auto-rows: 2in; gap: 0.125in 0.1875in; }
            .label { width: 4in; height: 2in; display: grid; grid-template-columns: 1.35in 1fr; gap: 0.15in; align-items: center; overflow: hidden; padding: 0.12in; border: 1px dashed #ddd; page-break-inside: avoid; }
            .qr-wrap { text-align: center; }
            img { width: 1.08in; height: 1.08in; object-fit: contain; }
            .qr-wrap p { margin: 0.04in 0 0; font-size: 8pt; font-weight: 900; text-transform: uppercase; letter-spacing: .03em; color: #9f1239; }
            h2 { margin: 0 0 0.08in; font-size: 13pt; line-height: 1.05; font-weight: 900; }
            .address { margin: 0; font-size: 10pt; line-height: 1.25; font-weight: 700; color: #4b342e; }
            .brand { margin: 0.1in 0 0; font-size: 8pt; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; color: #9f1239; }
            @media print { .label { border-color: transparent; } }
          </style>
        </head>
        <body><main class="sheet">${labelsHtml}</main><script>window.onload = function(){ window.print(); };</script></body>
      </html>
    `);

    printWindow.document.close();
  };

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.24),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">Claim QR mailers</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Print claim QR codes</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
            Select restaurants and activities, then print two-column 4&quot; × 2&quot; mailer labels with the QR on the left and the location name plus full address on the right.
          </p>
        </section>

        {error && <div className="mt-5 rounded-3xl border border-red-500/30 bg-red-500/10 p-5 text-sm font-bold text-red-200">{error}</div>}

        <section className="mt-5 rounded-[1.75rem] border border-white/10 bg-[#120d0b] p-4 shadow-2xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, address, city, or type..." className="h-12 flex-1 rounded-full border border-white/10 bg-white/[0.07] px-5 text-sm font-semibold text-white outline-none placeholder:text-white/35 focus:border-rose-300" />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setSelectedIds(filteredLocations.map((location) => `${location.type}:${location.id}`))} className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/70 hover:bg-white/10">Select shown</button>
              <button onClick={() => setSelectedIds([])} className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/70 hover:bg-white/10">Clear</button>
              <button onClick={printLabels} disabled={selectedIds.length === 0} className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 py-3 text-sm font-black text-white shadow-lg disabled:opacity-50">Print {selectedIds.length || ""} labels</button>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {loading && <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 text-sm font-bold text-white/50">Loading labels...</div>}
          {!loading && filteredLocations.map((location) => {
            const key = `${location.type}:${location.id}`;
            const selected = selectedIds.includes(key);
            return (
              <label key={key} className={`flex cursor-pointer gap-4 rounded-[1.5rem] border p-4 transition ${selected ? "border-rose-400 bg-rose-500/10" : "border-white/10 bg-white/[0.06] hover:bg-white/[0.09]"}`}>
                <input type="checkbox" checked={selected} onChange={() => toggleSelect(location)} className="mt-2" />
                {location.qr_code_data_url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={location.qr_code_data_url} alt={`${location.name || "Location"} QR`} className="h-20 w-20 rounded-2xl bg-white p-2" />
                  </>
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-black/30 text-xs font-black text-white/30">No QR</div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-black">{location.name || "Untitled location"}</p>
                  <p className="mt-1 text-sm leading-5 text-white/55">{[location.address, location.city, location.state, location.zip_code].filter(Boolean).join(", ") || "Address not listed"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-black uppercase text-white/55">{location.type === "restaurants" ? "Restaurant" : "Activity"}</span>
                    <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-black uppercase text-white/55">{location.claimed ? "Claimed" : "Open claim"}</span>
                  </div>
                </div>
              </label>
            );
          })}
        </section>
      </div>
    </main>
  );
}
