"use client";

import { useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { extractClaimCodeFromQrValue } from "@/lib/claimQr";

type ClaimQrScannerProps = {
  onCodeFound: (code: string) => void;
  onClose: () => void;
  title?: string;
  description?: string;
};

export default function ClaimQrScanner({
  onCodeFound,
  onClose,
  title = "Device QR scanner",
  description = "Point your camera at the QR code on your TheOutHaven postcard.",
}: ClaimQrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerIdRef = useRef(
    `claim-qr-reader-${Math.random().toString(36).slice(2)}`
  );
  const hasScannedRef = useRef(false);
  const [message, setMessage] = useState("Starting camera...");

  useEffect(() => {
    let mounted = true;

    async function stopScanner() {
      const scanner = scannerRef.current;
      if (!scanner) return;

      try {
        await scanner.stop();
      } catch {
        // Scanner may already be stopped.
      }

      try {
        await scanner.clear();
      } catch {
        // Scanner element may already be cleared.
      }

      scannerRef.current = null;
    }

    async function startScanner() {
      if (typeof window === "undefined") return;

      try {
        const { Html5Qrcode } = await import("html5-qrcode");

        if (!mounted) return;

        const scanner = new Html5Qrcode(scannerIdRef.current);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
          },
          async (decodedText: string) => {
            if (hasScannedRef.current) return;

            hasScannedRef.current = true;
            setMessage("QR code scanned. Verifying claim code...");

            const code = extractClaimCodeFromQrValue(decodedText);

            await stopScanner();

            if (code) {
              onCodeFound(code);
            }
          },
          () => {
            // Ignore normal scan misses.
          }
        );

        if (mounted) {
          setMessage(description);
        }
      } catch {
        if (!mounted) return;

        setMessage(
          "Camera access was blocked or is not available. You can still enter the printed claim code manually."
        );
      }
    }

    startScanner();

    return () => {
      mounted = false;
      void stopScanner();
    };
  }, [description, onCodeFound]);

  async function handleClose() {
    const scanner = scannerRef.current;

    try {
      await scanner?.stop();
    } catch {
      // Scanner may already be stopped.
    }

    try {
      await scanner?.clear();
    } catch {
      // Scanner may already be cleared.
    }

    scannerRef.current = null;
    onClose();
  }

  return (
    <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#e1062a]">
            {title}
          </p>
          <p className="mt-2 text-sm font-bold leading-6 text-white/60">
            {message}
          </p>
        </div>

        <button
          type="button"
          onClick={handleClose}
          className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/60 transition hover:border-white/30 hover:text-white"
        >
          Close
        </button>
      </div>

      <div
        id={scannerIdRef.current}
        className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d]"
      />
    </div>
  );
}
