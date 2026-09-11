import "server-only";

import type { GeneratedWebsiteLocationSnapshot } from "@/lib/websites/location-content";
import type { WebsiteArtifactFile } from "@/lib/websites/publish-contract";

const RESERVATION_FRAME_PATTERN = /<div class="reservation-frame-shell"><iframe class="reservation-frame" src="https:\/\/www\.theouthaven\.com\/embed\/reservations\/[^\"]+" title="[^"]*" loading="eager"><\/iframe><\/div>/g;

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function providerLabel(provider: string | null | undefined) {
  const value = String(provider || "").trim();
  if (!value) return "reservation provider";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shouldUseExternalReservations(location: GeneratedWebsiteLocationSnapshot) {
  if (!location.reservation_link || location.allow_external_reservations === false) return false;
  if (location.uses_internal_reservations || location.internal_reservations_enabled) return false;
  return true;
}

function externalReservationMarkup(location: GeneratedWebsiteLocationSnapshot) {
  const provider = providerLabel(location.reservation_provider);
  const href = escapeHtml(location.reservation_link);
  return `<div class="reservation-frame-shell reservation-external-shell"><div class="reservation-external-card"><p class="eyebrow">Existing reservation system</p><h3>Continue with ${escapeHtml(provider)}</h3><p>This business keeps its current reservation provider. Continue booking without changing systems.</p><a class="button primary reservation-external-cta" href="${href}" target="_blank" rel="noopener noreferrer">Reserve with ${escapeHtml(provider)}</a></div></div>`;
}

function externalReservationStyles() {
  return `.reservation-external-shell{min-height:0;display:grid;place-items:center;padding:clamp(24px,5vw,54px)}.reservation-external-card{width:min(100%,620px);padding:clamp(28px,5vw,54px);border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);text-align:left}.reservation-external-card h3{margin:0;font-family:var(--display);font-size:clamp(2rem,4vw,3.75rem);font-weight:500;line-height:1}.reservation-external-card>p:not(.eyebrow){margin:20px 0 0;color:var(--muted);font-size:1rem;line-height:1.7}.reservation-external-cta{margin-top:28px}`;
}

export function routeGeneratedReservationArtifact<T extends WebsiteArtifactFile>(
  files: T[],
  location: GeneratedWebsiteLocationSnapshot,
): T[] {
  if (!shouldUseExternalReservations(location)) return files;

  return files.map((file) => {
    if (file.path !== "index.html" || !file.content) return file;
    if (!file.content.includes("reservation-frame")) return file;

    let content = file.content.replace(RESERVATION_FRAME_PATTERN, externalReservationMarkup(location));
    if (content.includes("reservation-external-shell")) {
      content = content.replace("</style>", `${externalReservationStyles()}</style>`);
      content = content.replace(/<div>Reservations powered by TheOutHaven<\/div>/g, `<div>Reservations handled by ${escapeHtml(providerLabel(location.reservation_provider))}</div>`);
    }
    return { ...file, content, encoding: "utf8" } as T;
  });
}
