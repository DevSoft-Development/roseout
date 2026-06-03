"use client";

import { X } from "lucide-react";
import AdminLocationSearch from "@/components/admin/AdminLocationSearch";

type AdminSearchModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function AdminSearchModal({
  open,
  onClose,
}: AdminSearchModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 px-4 pt-24 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-[#100b0d] p-5 shadow-2xl shadow-black/40">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">
              Admin Search
            </p>
            <h2 className="mt-1 text-2xl font-black text-white">
              Find a location fast
            </h2>
            <p className="mt-1 text-sm text-white/55">
              Search by location name, owner email, phone number, or address.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition hover:border-rose-300/40 hover:bg-rose-500/10 hover:text-white"
            aria-label="Close admin search"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <AdminLocationSearch autoFocus onSelect={onClose} />
      </div>
    </div>
  );
}
