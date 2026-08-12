export type OnboardingLocation = {
  id: string;
  name: string;
  locationType: "restaurant" | "activity";
  primaryCategory: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  website: string | null;
  alreadyClaimed: boolean;
};

export function cleanSearchTerm(value: unknown) {
  return String(value ?? "")
    .replace(/[^\p{L}\p{N}\s'&-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function locationDisplayName(row: Record<string, unknown>) {
  return String(
    row.name || row.restaurant_name || row.activity_name || "TheOutHaven location",
  ).trim();
}

export function toOnboardingLocation(
  row: Record<string, unknown>,
): OnboardingLocation {
  return {
    id: String(row.id),
    name: locationDisplayName(row),
    locationType:
      normalized(row.location_type).includes("restaurant")
        ? "restaurant"
        : "activity",
    primaryCategory: row.primary_category ? String(row.primary_category) : null,
    address: row.address ? String(row.address) : null,
    city: row.city ? String(row.city) : null,
    state: row.state ? String(row.state) : null,
    zipCode: row.zip_code ? String(row.zip_code) : null,
    phone: row.phone ? String(row.phone) : null,
    website: row.website ? String(row.website) : null,
    alreadyClaimed: Boolean(
      row.is_claimed ||
        row.claimed ||
        normalized(row.claim_status) === "approved" ||
        row.owner_user_id,
    ),
  };
}

export function rankOnboardingLocation(
  location: OnboardingLocation,
  query: string,
) {
  const term = normalized(query);
  const name = normalized(location.name);
  const address = normalized(location.address);
  const city = normalized(location.city);
  const zip = normalized(location.zipCode);
  let score = 0;
  if (name === term) score += 100;
  else if (name.startsWith(term)) score += 70;
  else if (name.includes(term)) score += 45;
  if (address.includes(term)) score += 30;
  if (city === term) score += 25;
  else if (city.startsWith(term)) score += 15;
  if (zip === term) score += 35;
  return score;
}
