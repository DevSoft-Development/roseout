export function cleanAddressPart(value?: string | null) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripCityStateZipFromAddress(
  address?: string | null,
  city?: string | null,
  state?: string | null,
  zip?: string | null,
) {
  let street = cleanAddressPart(address);
  const cleanCity = cleanAddressPart(city);
  const cleanState = cleanAddressPart(state);
  const cleanZip = cleanAddressPart(zip);

  if (!street) return "";

  const compactZip = cleanZip.replace(/\D/g, "");

  const suffixPatterns = [
    cleanCity && cleanState && compactZip
      ? `${escapeRegExp(cleanCity)}\\s*,\\s*${escapeRegExp(cleanState)}\\s*,?\\s*${escapeRegExp(compactZip)}`
      : "",
    cleanCity && cleanState
      ? `${escapeRegExp(cleanCity)}\\s*,\\s*${escapeRegExp(cleanState)}`
      : "",
    cleanState && compactZip
      ? `${escapeRegExp(cleanState)}\\s*,?\\s*${escapeRegExp(compactZip)}`
      : "",
    compactZip ? escapeRegExp(compactZip) : "",
  ].filter(Boolean);

  let changed = true;

  while (changed) {
    changed = false;

    for (const pattern of suffixPatterns) {
      const next = street.replace(
        new RegExp(`\\s*,?\\s*${pattern}\\s*$`, "i"),
        "",
      );

      if (next !== street) {
        street = next;
        changed = true;
      }
    }

    street = street.replace(/\s*,\s*$/, "").trim();
  }

  return street.replace(/\s*,\s*$/, "").trim();
}

export function formatFullAddress({
  address,
  city,
  state,
  zip,
  zip_code,
  fallback = "Address not listed",
}: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  zip_code?: string | null;
  fallback?: string;
}) {
  const cleanCity = cleanAddressPart(city);
  const cleanState = cleanAddressPart(state);
  const cleanZip = cleanAddressPart(zip_code || zip);

  const street = stripCityStateZipFromAddress(
    address,
    cleanCity,
    cleanState,
    cleanZip,
  );

  const cityState = [cleanCity, cleanState].filter(Boolean).join(", ");
  const cityStateZip = [cityState, cleanZip].filter(Boolean).join(" ");

  return [street, cityStateZip].filter(Boolean).join(", ") || fallback;
}

export function normalizeAddressForSave({
  address,
  city,
  state,
  zip,
  zip_code,
}: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  zip_code?: string | null;
}) {
  return stripCityStateZipFromAddress(
    address,
    city,
    state,
    zip_code || zip,
  );
}
