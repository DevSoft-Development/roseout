export type StampsMode = "mock" | "testing" | "live";

export type PostcardAddress = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
};

export type PostcardValidationResult = {
  valid: boolean;
  normalized: PostcardAddress;
  warnings: string[];
  source: "mock" | "stamps";
};

export type PostcardQuote = {
  mode: StampsMode;
  mailClass: "USPS First-Class Mail Postcard";
  packageType: "Postcard";
  quantity: number;
  unitPostageCents: number | null;
  totalPostageCents: number | null;
  currency: "USD";
  readyForPurchase: boolean;
  source: "mock" | "stamps";
  note: string;
};

export function getStampsMode(): StampsMode {
  const value = String(process.env.STAMPS_MODE || "mock").toLowerCase();
  if (value === "testing" || value === "live") return value;
  return "mock";
}

export function getStampsConfiguration() {
  const mode = getStampsMode();
  const integrationId = process.env.STAMPS_INTEGRATION_ID?.trim() || "";
  const username = process.env.STAMPS_USERNAME?.trim() || "";
  const password = process.env.STAMPS_PASSWORD?.trim() || "";
  const configured = Boolean(integrationId && username && password);

  return {
    mode,
    configured,
    postcardEnabled: process.env.STAMPS_POSTCARD_ENABLED === "true",
    livePurchasesEnabled: mode === "live" && process.env.STAMPS_LIVE_PURCHASES_ENABLED === "true",
  };
}

function normalizeState(value: string) {
  return value.trim().toUpperCase().slice(0, 2);
}

function normalizeZip(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 5 ? digits.slice(0, 5) : digits;
}

export async function validatePostcardAddress(address: PostcardAddress): Promise<PostcardValidationResult> {
  const normalized: PostcardAddress = {
    name: address.name.trim(),
    street: address.street.trim(),
    city: address.city.trim(),
    state: normalizeState(address.state),
    zip: normalizeZip(address.zip),
  };

  const warnings: string[] = [];
  if (!normalized.name) warnings.push("Missing business name.");
  if (!normalized.street) warnings.push("Missing street address.");
  if (!normalized.city) warnings.push("Missing city.");
  if (normalized.state.length !== 2) warnings.push("State must be a 2-letter code.");
  if (normalized.zip.length !== 5) warnings.push("ZIP code must contain 5 digits.");

  // Keep the workflow usable before Stamps.com issues the Integration ID.
  // Once credentials are present this function becomes the single place where
  // SWS/IM CleanseAddress is connected, without changing the admin UI contract.
  return {
    valid: warnings.length === 0,
    normalized,
    warnings,
    source: "mock",
  };
}

export async function quoteFirstClassPostcards(quantity: number): Promise<PostcardQuote> {
  const config = getStampsConfiguration();
  const safeQuantity = Math.max(0, Math.floor(quantity));

  if (!config.configured || !config.postcardEnabled) {
    return {
      mode: config.mode,
      mailClass: "USPS First-Class Mail Postcard",
      packageType: "Postcard",
      quantity: safeQuantity,
      unitPostageCents: null,
      totalPostageCents: null,
      currency: "USD",
      readyForPurchase: false,
      source: "mock",
      note: !config.configured
        ? "Waiting for the Stamps.com Integration ID and account credentials."
        : "Stamps.com credentials are present, but postcard API access has not been confirmed yet.",
    };
  }

  // Live SWS/IM GetRates integration is intentionally gated until Stamps.com
  // confirms Postcard enablement for this account. We do not hard-code a USPS
  // rate because the provider should remain the source of truth at purchase time.
  return {
    mode: config.mode,
    mailClass: "USPS First-Class Mail Postcard",
    packageType: "Postcard",
    quantity: safeQuantity,
    unitPostageCents: null,
    totalPostageCents: null,
    currency: "USD",
    readyForPurchase: false,
    source: "mock",
    note: "Postcard API access is configured. Connect SWS/IM GetRates after Stamps.com confirms the account capability.",
  };
}
