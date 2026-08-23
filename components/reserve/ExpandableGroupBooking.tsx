"use client";

import { useState } from "react";
import LargeGroupBookingForm from "@/components/reserve/LargeGroupBookingForm";

type Props = {
  locationId: string;
  locationName: string;
  minPartySize?: number;
  maxPartySize?: number;
  className?: string;
};

export default function ExpandableGroupBooking({
  locationId,
  locationName,
  minPartySize = 8,
  maxPartySize = 40,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const range = maxPartySize > minPartySize ? `${minPartySize}-${maxPartySize}` : `${minPartySize}+`;

  return (
    <section className={`rounded-[1.6rem] border border-white/10 bg-[var(--toh-panel,#120d0c)] p-5 text-white sm:p-6 ${className}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-red-300">Large parties</p>
          <h2 className="mt-2 text-2xl font-black">Group Booking</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">For parties of {range} guests. Check live availability and send the venue your request.</p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="toh-btn inline-flex min-h-12 shrink-0 items-center justify-center px-5 text-sm"
        >
          {open ? "Close Group Booking" : "Open Group Booking"}
        </button>
      </div>

      {open ? (
        <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-[#090706] p-4 sm:p-5">
          <LargeGroupBookingForm locationId={locationId} locationName={locationName} compact />
        </div>
      ) : null}
    </section>
  );
}
