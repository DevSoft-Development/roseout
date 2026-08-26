export type StampsMode = "mock" | "staging" | "live";

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

export type StampsConnectionResult = {
  ok: boolean;
  mode: StampsMode;
  accountStatus: string | null;
  customerId: string | null;
  meterNumber: string | null;
  availablePostage: number | null;
  namespace: string | null;
  message: string;
};

const DEFAULT_STAGING_ENDPOINT = "https://swsim.testing.stamps.com/swsim/swsimv160.asmx";
const DEFAULT_STAGING_WSDL = `${DEFAULT_STAGING_ENDPOINT}?wsdl`;
let cachedNamespace: string | null = null;

export function getStampsMode(): StampsMode {
  const value = String(process.env.STAMPS_MODE || "mock").toLowerCase();
  if (value === "staging" || value === "testing") return "staging";
  if (value === "live" || value === "production") return "live";
  return "mock";
}

export function getStampsConfiguration() {
  const mode = getStampsMode();
  const integrationId = process.env.STAMPS_INTEGRATION_ID?.trim() || "";
  const username = process.env.STAMPS_USERNAME?.trim() || "";
  const password = process.env.STAMPS_PASSWORD?.trim() || "";
  const configured = Boolean(integrationId && username && password);
  const endpointUrl = process.env.STAMPS_ENDPOINT_URL?.trim() || (mode === "staging" ? DEFAULT_STAGING_ENDPOINT : "");
  const wsdlUrl = process.env.STAMPS_WSDL_URL?.trim() || (mode === "staging" ? DEFAULT_STAGING_WSDL : "");
  const explicitlyDisabled = process.env.STAMPS_POSTCARD_ENABLED === "false";

  return {
    mode,
    configured,
    endpointUrl,
    wsdlUrl,
    postcardEnabled: !explicitlyDisabled && configured && (mode === "staging" || process.env.STAMPS_POSTCARD_ENABLED === "true"),
    livePurchasesEnabled: mode === "live" && process.env.STAMPS_LIVE_PURCHASES_ENABLED === "true",
    credentials: { integrationId, username, password },
  };
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function readXmlTag(xml: string, tag: string) {
  const safeTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<(?:[A-Za-z0-9_-]+:)?${safeTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${safeTag}>`, "i"));
  return match ? decodeXml(match[1].trim()) : null;
}

function redactSoapXml(xml: string) {
  return xml
    .replace(/<(?:[A-Za-z0-9_-]+:)?Password(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z0-9_-]+:)?Password>/gi, "<Password>[REDACTED]</Password>")
    .replace(/<(?:[A-Za-z0-9_-]+:)?Authenticator(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z0-9_-]+:)?Authenticator>/gi, "<Authenticator>[REDACTED]</Authenticator>")
    .replace(/<(?:[A-Za-z0-9_-]+:)?IntegrationID(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z0-9_-]+:)?IntegrationID>/gi, "<IntegrationID>[REDACTED]</IntegrationID>");
}

async function getStampsNamespace(wsdlUrl: string) {
  if (cachedNamespace) return cachedNamespace;
  const response = await fetch(wsdlUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load Stamps.com v160 WSDL (${response.status}).`);
  const wsdl = await response.text();
  const match = wsdl.match(/targetNamespace=["']([^"']+)["']/i);
  if (!match?.[1]) throw new Error("Stamps.com v160 WSDL did not expose a target namespace.");
  cachedNamespace = match[1];
  return cachedNamespace;
}

async function stampsSoapCall(operation: string, body: string) {
  const config = getStampsConfiguration();
  if (!config.configured) throw new Error("Stamps.com credentials are not configured.");
  if (!config.endpointUrl || !config.wsdlUrl) throw new Error("Stamps.com endpoint/WSDL is not configured.");

  const namespace = await getStampsNamespace(config.wsdlUrl);
  const requestXml = `<?xml version="1.0" encoding="utf-8"?>\n<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sws="${escapeXml(namespace)}"><soapenv:Header/><soapenv:Body><sws:${operation}>${body}</sws:${operation}></soapenv:Body></soapenv:Envelope>`;
  const startedAt = Date.now();
  const response = await fetch(config.endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `"${namespace}/${operation}"`,
    },
    body: requestXml,
    cache: "no-store",
  });
  const responseXml = await response.text();

  console.info("Stamps SWS/IM SOAP exchange", {
    operation,
    durationMs: Date.now() - startedAt,
    status: response.status,
    requestXml: redactSoapXml(requestXml),
    responseXml: redactSoapXml(responseXml),
  });

  const fault = readXmlTag(responseXml, "faultstring") || readXmlTag(responseXml, "FaultReason") || readXmlTag(responseXml, "Message");
  if (!response.ok || responseXml.includes(":Fault") || responseXml.includes("<Fault")) {
    throw new Error(fault || `Stamps.com ${operation} failed (${response.status}).`);
  }

  return { namespace, responseXml };
}

export async function testStampsConnection(): Promise<StampsConnectionResult> {
  const config = getStampsConfiguration();
  if (config.mode === "mock") {
    return { ok: false, mode: config.mode, accountStatus: null, customerId: null, meterNumber: null, availablePostage: null, namespace: null, message: "STAMPS_MODE is not set to staging or live." };
  }
  if (!config.configured) {
    return { ok: false, mode: config.mode, accountStatus: null, customerId: null, meterNumber: null, availablePostage: null, namespace: null, message: "Stamps.com credentials are incomplete." };
  }

  const { integrationId, username, password } = config.credentials;
  const credentials = `<sws:Credentials><sws:IntegrationID>${escapeXml(integrationId)}</sws:IntegrationID><sws:Username>${escapeXml(username)}</sws:Username><sws:Password>${escapeXml(password)}</sws:Password></sws:Credentials>`;
  const { namespace, responseXml } = await stampsSoapCall("GetAccountInfo", credentials);
  const accountStatus = readXmlTag(responseXml, "AccountStatus");
  const availablePostageRaw = readXmlTag(responseXml, "AvailablePostage");
  const availablePostage = availablePostageRaw == null ? null : Number(availablePostageRaw);

  return {
    ok: true,
    mode: config.mode,
    accountStatus,
    customerId: readXmlTag(responseXml, "CustomerID"),
    meterNumber: readXmlTag(responseXml, "MeterNumber"),
    availablePostage: Number.isFinite(availablePostage) ? availablePostage : null,
    namespace,
    message: config.mode === "staging" ? "Connected to Stamps.com SWS/IM v160 staging. Test indicia must never be mailed." : "Connected to Stamps.com SWS/IM.",
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
        ? "Waiting for Stamps.com credentials."
        : "Stamps.com credentials are present, but postcard API access is disabled.",
    };
  }

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
    note: config.mode === "staging"
      ? "SWS/IM staging is configured. Test the connection first; rate and indicia calls are intentionally added after authentication is verified."
      : "Postcard API access is configured. Live purchase remains gated until production approval.",
  };
}
