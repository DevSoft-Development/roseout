"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ClaimQrScanner from "@/components/business/ClaimQrScanner";
import { buildClaimUrlFromCode } from "@/lib/claimQr";

type ClaimQrScanLauncherProps = {
  className?: string;
  buttonLabel?: string;
  mode?: "redirect" | "inline";
  onCodeFound?: (code: string) => void;
};

export default function ClaimQrScanLauncher({
  className = "",
  buttonLabel = "Scan QR Code With Device Camera",
  mode = "redirect",
  onCodeFound,
}: ClaimQrScanLauncherProps) {
  const router = useRouter();
  const [showScanner, setShowScanner] = useState(false);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setShowScanner(true)}
        className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-6 py-4 text-sm font-black text-white transition hover:border-[#e1062a]/60 hover:bg-[#e1062a]/10"
      >
        {buttonLabel}
      </button>

      {showScanner && (
        <ClaimQrScanner
          onClose={() => setShowScanner(false)}
          onCodeFound={(code) => {
            setShowScanner(false);

            if (onCodeFound) {
              onCodeFound(code);
              return;
            }

            if (mode === "redirect") {
              router.push(buildClaimUrlFromCode(code));
            }
          }}
        />
      )}
    </div>
  );
}
