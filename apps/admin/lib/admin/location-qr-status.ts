export type LocationQrStatusSource =
  | "qr_record"
  | "location_field"
  | "claim_code"
  | "none";

export type LocationQrStatus = {
  hasQrCode: boolean;
  source: LocationQrStatusSource;
  hasQrRecord: boolean;
  hasLocationQrFields: boolean;
  hasClaimCode: boolean;
  destination: string | null;
  isLegacyDomain: boolean;
  isBroken: boolean;
};

const LOCATION_QR_FIELDS = [
  "claim_qr_url",
  "qr_link",
  "qr_code_data_url",
  "claim_url",
] as const;
const CLAIM_CODE_FIELDS = ["claim_code", "code"] as const;
const QR_RECORD_FIELDS = [
  "claim_qr_url",
  "qr_code_data_url",
  "qr_code_url",
  "qr_url",
  "qr_link",
  "claim_url",
  "destination_url",
  "target_url",
  "url",
  "value",
  "data",
  "claim_code",
  "code",
  "id",
] as const;
const LEGACY_HOSTS = new Set([
  "roseout.com",
  "www.roseout.com",
  "roseout.vercel.app",
]);
const PLACEHOLDER_VALUES = new Set([
  "-",
  "--",
  "—",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "todo",
  "tbd",
  "placeholder",
  "example",
  "test",
  "unknown",
]);

function normalizeValue(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (PLACEHOLDER_VALUES.has(lower)) return null;
  if (/^(x+|0+|#+|\*+)$/.test(lower)) return null;
  if (/^(https?:\/\/)?(example\.(com|org|net)|localhost)(\/|$)/i.test(text))
    return null;
  return text;
}

function isDataUrl(value: string) {
  return /^data:image\/[^;,]+;base64,/i.test(value);
}

function isLikelyClaimCode(value: string) {
  return /^[a-z0-9][a-z0-9_-]{2,}$/i.test(value);
}

function classifyDestination(value: string): {
  usable: boolean;
  legacy: boolean;
  broken: boolean;
} {
  if (isDataUrl(value)) return { usable: true, legacy: false, broken: false };
  if (!/^https?:\/\//i.test(value)) {
    return {
      usable: isLikelyClaimCode(value),
      legacy: false,
      broken: !isLikelyClaimCode(value),
    };
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const legacy = LEGACY_HOSTS.has(hostname);
    return { usable: true, legacy, broken: false };
  } catch {
    return { usable: false, legacy: false, broken: true };
  }
}

function collectValues(
  record: Record<string, unknown>,
  fields: readonly string[],
) {
  return fields
    .map((field) => ({ field, value: normalizeValue(record[field]) }))
    .filter((item): item is { field: string; value: string } =>
      Boolean(item.value),
    );
}

export function getLocationQrStatus({
  location,
  qrCodes,
}: {
  location: Record<string, unknown>;
  qrCodes: Record<string, unknown>[];
}): LocationQrStatus {
  const records = Array.isArray(qrCodes) ? qrCodes : [];
  const recordValues = records.flatMap((record) =>
    collectValues(record || {}, QR_RECORD_FIELDS),
  );
  const locationQrValues = collectValues(location || {}, LOCATION_QR_FIELDS);
  const claimCodeValues = [
    ...collectValues(location || {}, CLAIM_CODE_FIELDS),
    ...records.flatMap((record) =>
      collectValues(record || {}, CLAIM_CODE_FIELDS),
    ),
  ];
  const allValues = [...recordValues, ...locationQrValues, ...claimCodeValues];
  const classified = allValues.map((item) =>
    item.field === "id"
      ? { ...item, usable: true, legacy: false, broken: false }
      : { ...item, ...classifyDestination(item.value) },
  );
  const firstUsable = classified.find((item) => item.usable) || null;
  const hasQrRecord = recordValues.some(
    (item) => item.field === "id" || classifyDestination(item.value).usable,
  );
  const hasLocationQrFields = locationQrValues.some(
    (item) => classifyDestination(item.value).usable,
  );
  const hasClaimCode = claimCodeValues.some(
    (item) => classifyDestination(item.value).usable,
  );
  const hasQrCode = Boolean(firstUsable);
  const source: LocationQrStatusSource = hasQrRecord
    ? "qr_record"
    : hasLocationQrFields
      ? "location_field"
      : hasClaimCode
        ? "claim_code"
        : "none";

  return {
    hasQrCode,
    source: hasQrCode ? source : "none",
    hasQrRecord,
    hasLocationQrFields,
    hasClaimCode,
    destination:
      firstUsable?.value ||
      classified.find((item) => item.broken)?.value ||
      null,
    isLegacyDomain: classified.some((item) => item.legacy),
    isBroken: classified.some((item) => item.broken),
  };
}

export type LocationQrAlert = [
  severity: string,
  title: string,
  text: string,
  action: string,
  href: string,
];

export function getLocationQrOperationalAlerts(
  status: LocationQrStatus,
  qrCodesHref: string,
): LocationQrAlert[] {
  if (status.isLegacyDomain) {
    return [
      [
        "medium",
        "QR code uses an old domain",
        "At least one QR/claim URL points at an old Roseout domain.",
        "Regenerate or repair the QR destination with the canonical TheOutHaven URL.",
        qrCodesHref,
      ],
    ];
  }
  if (status.isBroken) {
    return [
      [
        "medium",
        "QR destination needs repair",
        "A QR/claim destination is malformed or unusable.",
        "Repair the QR destination without creating duplicate records.",
        qrCodesHref,
      ],
    ];
  }
  if (!status.hasQrCode) {
    return [
      [
        "medium",
        "QR code missing",
        "No usable QR or claim code representation exists for this location.",
        "Generate QR records without duplicating existing codes.",
        qrCodesHref,
      ],
    ];
  }
  return [];
}
