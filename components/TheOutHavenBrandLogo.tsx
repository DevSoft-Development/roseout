"use client";

type TheOutHavenBrandLogoProps = {
  className?: string;
  width?: number;
  height?: number;
  label?: string;
};

/**
 * Approved brand image with the red circular H mark.
 * Never silently downgrade to a text-only approximation if an asset fails.
 */
export default function TheOutHavenBrandLogo({
  className = "h-auto w-[190px] max-w-full object-contain",
  width = 600,
  height = 200,
  label,
}: TheOutHavenBrandLogoProps) {
  return (
    <span className="inline-flex min-w-0 max-w-full flex-col">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/theouthaven-official-logo.png"
        alt="TheOutHaven official logo"
        width={width}
        height={height}
        className={className}
        loading="eager"
        decoding="async"
      />
      {label ? (
        <span className="mt-2 text-xs font-bold uppercase tracking-[0.22em] text-white/60">{label}</span>
      ) : null}
    </span>
  );
}
