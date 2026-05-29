"use client";

import { useEffect, useRef, useState } from "react";

type ClaimQrScannerProps = {
  onCodeFound: (code: string) => void;
  onClose: () => void;
};

type Html5QrcodeInstance = {
  isScanning?: boolean;
  start: (
    cameraConfig: { facingMode: string },
    config: { fps: number; qrbox: { width: number; height: number }; aspectRatio: number },
    qrCodeSuccessCallback: (decodedText: string) => void | Promise<void>,
    qrCodeErrorCallback: () => void,
  ) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => Promise<void>;
};

type Html5QrcodeConstructor = new (elementId: string) => Html5QrcodeInstance;

const CAMERA_UNAVAILABLE_MESSAGE =
  "Camera access was blocked or is not available. You can still enter the printed claim code manually below.";

export default function ClaimQrScanner({ onCodeFound, onClose }: ClaimQrScannerProps) {
  const scannerRef = useRef<Html5QrcodeInstance | null>(null);
  const scannerIdRef = useRef(`claim-qr-reader-${Math.random().toString(36).slice(2)}`);
  const hasScannedRef = useRef(false);
  const stoppingRef = useRef<Promise<void> | null>(null);
  const [message, setMessage] = useState("Starting camera...");

  useEffect(() => {
    let mounted = true;

    async function stopScanner() {
      if (stoppingRef.current) {
        await stoppingRef.current;
        return;
      }

      const scanner = scannerRef.current;
      if (!scanner) return;

      stoppingRef.current = (async () => {
        try {
          if (scanner.isScanning) {
            await scanner.stop();
          }
        } catch {
          // Ignore stop errors so repeated close/unmount actions never crash the page.
        }

        try {
          await scanner.clear();
        } catch {
          // Ignore clear errors so repeated close/unmount actions never crash the page.
        } finally {
          if (scannerRef.current === scanner) {
            scannerRef.current = null;
          }
          stoppingRef.current = null;
        }
      })();

      await stoppingRef.current;
    }

    async function startScanner() {
      if (typeof window === "undefined") return;

      const { Html5Qrcode } = (await import("html5-qrcode")) as { Html5Qrcode: Html5QrcodeConstructor };

      try {
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

            const code = extractClaimCodeFromQrValue(decodedText);

            if (mounted) {
              setMessage("QR code scanned. Verifying claim code...");
            }

            await stopScanner();

            if (code) {
              onCodeFound(code);
            }
          },
          () => {
            // Ignore normal scan misses while the camera is looking for a QR code.
          },
        );

        if (mounted) {
          setMessage("Point your camera at the QR code on your TheOutHaven postcard.");
        } else {
          await stopScanner();
        }
      } catch {
        if (!mounted) return;

        hasScannedRef.current = false;
        setMessage(CAMERA_UNAVAILABLE_MESSAGE);
        await stopScanner();
      }
    }

    void startScanner().catch(async () => {
      if (!mounted) return;

      setMessage(CAMERA_UNAVAILABLE_MESSAGE);
      await stopScanner();
    });

    return () => {
      mounted = false;
      stopScanner();
    };
  }, [onCodeFound]);

  return (
    <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black p-5 shadow-2xl shadow-red-950/20">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#e1062a]">
            Device QR scanner
          </p>
          <p className="mt-2 text-sm font-bold leading-6 text-white/60">
            {message}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/60 transition hover:border-white/30 hover:text-white"
        >
          Close scanner
        </button>
      </div>

      <div
        id={scannerIdRef.current}
        className="mt-5 min-h-[260px] overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] [&_video]:rounded-2xl"
      />

      <p className="mt-4 text-xs font-bold leading-5 text-white/38">
        Camera scanning requires HTTPS in production. Manual claim-code entry remains available below.
      </p>
    </div>
  );
}

function extractClaimCodeFromQrValue(value: string) {
  const raw = value.trim();

  try {
    const url = raw.startsWith("http")
      ? new URL(raw)
      : raw.startsWith("/")
        ? new URL(raw, window.location.origin)
        : null;

    const code =
      url?.searchParams.get("code") ||
      url?.searchParams.get("claimCode") ||
      url?.searchParams.get("claim_code");

    if (code) {
      return code.trim().toUpperCase().replace(/\s+/g, "");
    }
  } catch {
    // Fall through to raw code support.
  }

  return raw.trim().toUpperCase().replace(/\s+/g, "");
}
