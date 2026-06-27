export type NycAddressInference = {
  borough: string | null;
  neighborhood: string | null;
  market: "NYC_CORE" | null;
};

function clean(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ZIP_TO_AREA: Record<string, { borough: string; neighborhood?: string }> = {
  "10001": { borough: "Manhattan", neighborhood: "Chelsea" },
  "10002": { borough: "Manhattan", neighborhood: "Lower East Side" },
  "10003": { borough: "Manhattan", neighborhood: "East Village" },
  "10004": { borough: "Manhattan", neighborhood: "Financial District" },
  "10005": { borough: "Manhattan", neighborhood: "Financial District" },
  "10006": { borough: "Manhattan", neighborhood: "Financial District" },
  "10007": { borough: "Manhattan", neighborhood: "Tribeca" },
  "10009": { borough: "Manhattan", neighborhood: "East Village" },
  "10010": { borough: "Manhattan", neighborhood: "Flatiron" },
  "10011": { borough: "Manhattan", neighborhood: "Chelsea" },
  "10012": { borough: "Manhattan", neighborhood: "SoHo" },
  "10013": { borough: "Manhattan", neighborhood: "Tribeca" },
  "10014": { borough: "Manhattan", neighborhood: "West Village" },
  "10016": { borough: "Manhattan", neighborhood: "Murray Hill" },
  "10017": { borough: "Manhattan", neighborhood: "Midtown East" },
  "10018": { borough: "Manhattan", neighborhood: "Garment District" },
  "10019": { borough: "Manhattan", neighborhood: "Midtown" },
  "10020": { borough: "Manhattan", neighborhood: "Midtown" },
  "10021": { borough: "Manhattan", neighborhood: "Upper East Side" },
  "10022": { borough: "Manhattan", neighborhood: "Midtown East" },
  "10023": { borough: "Manhattan", neighborhood: "Upper West Side" },
  "10024": { borough: "Manhattan", neighborhood: "Upper West Side" },
  "10025": { borough: "Manhattan", neighborhood: "Upper West Side" },
  "10026": { borough: "Manhattan", neighborhood: "Harlem" },
  "10027": { borough: "Manhattan", neighborhood: "Harlem" },
  "10028": { borough: "Manhattan", neighborhood: "Upper East Side" },
  "10029": { borough: "Manhattan", neighborhood: "East Harlem" },
  "10030": { borough: "Manhattan", neighborhood: "Harlem" },
  "10031": { borough: "Manhattan", neighborhood: "Hamilton Heights" },
  "10032": { borough: "Manhattan", neighborhood: "Washington Heights" },
  "10033": { borough: "Manhattan", neighborhood: "Washington Heights" },
  "10034": { borough: "Manhattan", neighborhood: "Inwood" },
  "10035": { borough: "Manhattan", neighborhood: "East Harlem" },
  "10036": { borough: "Manhattan", neighborhood: "Times Square" },
  "10037": { borough: "Manhattan", neighborhood: "Harlem" },
  "10038": { borough: "Manhattan", neighborhood: "Financial District" },
  "10039": { borough: "Manhattan", neighborhood: "Harlem" },
  "10040": { borough: "Manhattan", neighborhood: "Washington Heights" },
  "11101": { borough: "Queens", neighborhood: "Long Island City" },
  "11102": { borough: "Queens", neighborhood: "Astoria" },
  "11103": { borough: "Queens", neighborhood: "Astoria" },
  "11104": { borough: "Queens", neighborhood: "Sunnyside" },
  "11105": { borough: "Queens", neighborhood: "Astoria" },
  "11106": { borough: "Queens", neighborhood: "Astoria" },
  "11354": { borough: "Queens", neighborhood: "Flushing" },
  "11355": { borough: "Queens", neighborhood: "Flushing" },
  "11357": { borough: "Queens", neighborhood: "Whitestone" },
  "11358": { borough: "Queens", neighborhood: "Auburndale" },
  "11360": { borough: "Queens", neighborhood: "Bayside" },
  "11361": { borough: "Queens", neighborhood: "Bayside" },
  "11364": { borough: "Queens", neighborhood: "Oakland Gardens" },
  "11368": { borough: "Queens", neighborhood: "Corona" },
  "11372": { borough: "Queens", neighborhood: "Jackson Heights" },
  "11373": { borough: "Queens", neighborhood: "Elmhurst" },
  "11374": { borough: "Queens", neighborhood: "Rego Park" },
  "11375": { borough: "Queens", neighborhood: "Forest Hills" },
  "11377": { borough: "Queens", neighborhood: "Woodside" },
  "11378": { borough: "Queens", neighborhood: "Maspeth" },
  "11385": { borough: "Queens", neighborhood: "Ridgewood" },
  "11432": { borough: "Queens", neighborhood: "Jamaica" },
  "11435": { borough: "Queens", neighborhood: "Jamaica" },
  "11201": { borough: "Brooklyn", neighborhood: "Downtown Brooklyn" },
  "11205": { borough: "Brooklyn", neighborhood: "Clinton Hill" },
  "11206": { borough: "Brooklyn", neighborhood: "Williamsburg" },
  "11211": { borough: "Brooklyn", neighborhood: "Williamsburg" },
  "11215": { borough: "Brooklyn", neighborhood: "Park Slope" },
  "11216": { borough: "Brooklyn", neighborhood: "Bed-Stuy" },
  "11217": { borough: "Brooklyn", neighborhood: "Boerum Hill" },
  "11221": { borough: "Brooklyn", neighborhood: "Bushwick" },
  "11222": { borough: "Brooklyn", neighborhood: "Greenpoint" },
  "11225": { borough: "Brooklyn", neighborhood: "Crown Heights" },
  "11226": { borough: "Brooklyn", neighborhood: "Flatbush" },
  "11231": { borough: "Brooklyn", neighborhood: "Red Hook" },
  "11232": { borough: "Brooklyn", neighborhood: "Sunset Park" },
  "11238": { borough: "Brooklyn", neighborhood: "Prospect Heights" },
  "10451": { borough: "Bronx", neighborhood: "South Bronx" },
  "10452": { borough: "Bronx", neighborhood: "Highbridge" },
  "10453": { borough: "Bronx", neighborhood: "Morris Heights" },
  "10454": { borough: "Bronx", neighborhood: "Mott Haven" },
  "10455": { borough: "Bronx", neighborhood: "Melrose" },
  "10456": { borough: "Bronx", neighborhood: "Morrisania" },
  "10457": { borough: "Bronx", neighborhood: "Tremont" },
  "10458": { borough: "Bronx", neighborhood: "Fordham" },
  "10461": { borough: "Bronx", neighborhood: "Pelham Bay" },
  "10463": { borough: "Bronx", neighborhood: "Riverdale" },
  "10467": { borough: "Bronx", neighborhood: "Norwood" },
  "10301": { borough: "Staten Island", neighborhood: "St. George" },
  "10304": { borough: "Staten Island", neighborhood: "Stapleton" },
  "10305": { borough: "Staten Island", neighborhood: "Rosebank" },
  "10306": { borough: "Staten Island", neighborhood: "New Dorp" },
  "10314": { borough: "Staten Island", neighborhood: "Mid-Island" },
};

const TEXT_HINTS: Array<{ terms: string[]; borough: string; neighborhood?: string }> = [
  { terms: ["long island city", "lic"], borough: "Queens", neighborhood: "Long Island City" },
  { terms: ["astoria"], borough: "Queens", neighborhood: "Astoria" },
  { terms: ["sunnyside"], borough: "Queens", neighborhood: "Sunnyside" },
  { terms: ["woodside"], borough: "Queens", neighborhood: "Woodside" },
  { terms: ["jackson heights"], borough: "Queens", neighborhood: "Jackson Heights" },
  { terms: ["flushing"], borough: "Queens", neighborhood: "Flushing" },
  { terms: ["forest hills"], borough: "Queens", neighborhood: "Forest Hills" },
  { terms: ["rego park"], borough: "Queens", neighborhood: "Rego Park" },
  { terms: ["jamaica"], borough: "Queens", neighborhood: "Jamaica" },
  { terms: ["williamsburg"], borough: "Brooklyn", neighborhood: "Williamsburg" },
  { terms: ["bushwick"], borough: "Brooklyn", neighborhood: "Bushwick" },
  { terms: ["bed stuy", "bed-stuy", "bedford stuyvesant"], borough: "Brooklyn", neighborhood: "Bed-Stuy" },
  { terms: ["park slope"], borough: "Brooklyn", neighborhood: "Park Slope" },
  { terms: ["crown heights"], borough: "Brooklyn", neighborhood: "Crown Heights" },
  { terms: ["harlem"], borough: "Manhattan", neighborhood: "Harlem" },
  { terms: ["midtown"], borough: "Manhattan", neighborhood: "Midtown" },
  { terms: ["chelsea"], borough: "Manhattan", neighborhood: "Chelsea" },
  { terms: ["soho"], borough: "Manhattan", neighborhood: "SoHo" },
  { terms: ["tribeca"], borough: "Manhattan", neighborhood: "Tribeca" },
  { terms: ["riverdale"], borough: "Bronx", neighborhood: "Riverdale" },
  { terms: ["fordham"], borough: "Bronx", neighborhood: "Fordham" },
  { terms: ["staten island"], borough: "Staten Island" },
];

function extractZip(input: {
  address?: string | null;
  formatted_address?: string | null;
  zip?: string | null;
  zip_code?: string | null;
  postal_code?: string | null;
}) {
  const explicit = String(input.zip_code || input.zip || input.postal_code || "").match(/\b\d{5}\b/)?.[0];
  if (explicit) return explicit;

  return String(input.address || input.formatted_address || "").match(/\b\d{5}\b/)?.[0] || null;
}

export function inferNycAddressArea(input: {
  address?: string | null;
  formatted_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  zip_code?: string | null;
  postal_code?: string | null;
  borough?: string | null;
  neighborhood?: string | null;
}): NycAddressInference {
  const state = clean(input.state);
  const text = clean([
    input.address,
    input.formatted_address,
    input.city,
    input.borough,
    input.neighborhood,
  ].filter(Boolean).join(" "));

  const zip = extractZip(input);

  if (zip && ZIP_TO_AREA[zip]) {
    const area = ZIP_TO_AREA[zip];

    return {
      borough: input.borough || area.borough,
      neighborhood: input.neighborhood || area.neighborhood || null,
      market: "NYC_CORE",
    };
  }

  if (state && state !== "ny") {
    return { borough: null, neighborhood: null, market: null };
  }

  for (const hint of TEXT_HINTS) {
    if (hint.terms.some((term) => text.includes(clean(term)))) {
      return {
        borough: input.borough || hint.borough,
        neighborhood: input.neighborhood || hint.neighborhood || null,
        market: "NYC_CORE",
      };
    }
  }

  return {
    borough: input.borough || null,
    neighborhood: input.neighborhood || null,
    market: null,
  };
}

export function getPublicAreaLabel(input: {
  city?: string | null;
  borough?: string | null;
  neighborhood?: string | null;
  address?: string | null;
  formatted_address?: string | null;
  state?: string | null;
  zip?: string | null;
  zip_code?: string | null;
}) {
  const inferred = inferNycAddressArea(input);

  const neighborhood = input.neighborhood || inferred.neighborhood;
  const borough = input.borough || inferred.borough;

  if (neighborhood && borough && clean(neighborhood) !== clean(borough)) {
    return `${neighborhood}, ${borough}`;
  }

  if (borough) return borough;

  return input.city || null;
}
