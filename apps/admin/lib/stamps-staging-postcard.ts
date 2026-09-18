import "server-only";

import { randomUUID } from "crypto";
import { getStampsConfiguration, type PostcardAddress } from "@/lib/stamps-postcard";

export type StagingPostcardProofResult = {
  ok: true;
  businessName: string;
  originalAddress: PostcardAddress;
  cleansedAddress: PostcardAddress & { zip4?: string | null };
  addressMatch: boolean;
  cityStateZipOk: boolean;
  amount: number;
  serviceType: string;
  packageType: string;
  shipDate: string;
  stampsTxId: string | null;
  integratorTxId: string;
  labelUrl: string | null;
  imageDataBase64: string | null;
  sampleOnly: false;
  warning: string;
};

type CleansedStampsAddress = PostcardAddress & {
  address2: string;
  zip4: string;
  dpb: string;
  checkDigit: string;
  urbanization: string;
  cleanseHash: string;
};

const ORIGIN = {
  fullName: "TheOutHaven LLC",
  company: "TheOutHaven LLC",
  address1: "555 Broadhollow Rd",
  address2: "Suite 305",
  city: "Melville",
  state: "NY",
  zip: "11747",
};

const POSTCARD = {
  length: 6,
  width: 4,
  height: 0.01,
  weightLb: 0,
  weightOz: 1,
} as const;

let cachedNamespace: string | null = null;
let cachedMailingIndiciumItemElement: string | null = null;

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '\"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function readXmlTag(xml: string, tag: string) {
  const safeTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...xml.matchAll(new RegExp(`<(?:[A-Za-z0-9_-]+:)?${safeTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${safeTag}>`, "gi"))];
  if (!matches.length) return null;
  return decodeXml(matches[0][1].trim());
}

function readBoolean(xml: string, tag: string) {
  return String(readXmlTag(xml, tag)).toLowerCase() === "true";
}

function redactSoapXml(xml: string) {
  return xml
    .replace(/<(?:[A-Za-z0-9_-]+:)?Password(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z0-9_-]+:)?Password>/gi, "<Password>[REDACTED]</Password>")
    .replace(/<(?:[A-Za-z0-9_-]+:)?Authenticator(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z0-9_-]+:)?Authenticator>/gi, "<Authenticator>[REDACTED]</Authenticator>")
    .replace(/<(?:[A-Za-z0-9_-]+:)?IntegrationID(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z0-9_-]+:)?IntegrationID>/gi, "<IntegrationID>[REDACTED]</IntegrationID>")
    .replace(/<(?:[A-Za-z0-9_-]+:)?IndiciumData(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z0-9_-]+:)?IndiciumData>/gi, "<IndiciumData>[REDACTED]</IndiciumData>")
    .replace(/<(?:[A-Za-z0-9_-]+:)?Url(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z0-9_-]+:)?Url>/gi, "<Url>[REDACTED LABEL URL]</Url>");
}

async function loadWsdl(wsdlUrl: string) {
  const response = await fetch(wsdlUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load Stamps.com v160 WSDL (${response.status}).`);
  return response.text();
}

async function getNamespace(wsdlUrl: string) {
  if (cachedNamespace) return cachedNamespace;
  const wsdl = await loadWsdl(wsdlUrl);
  const match = wsdl.match(/targetNamespace=[\"']([^\"']+)[\"']/i);
  if (!match?.[1]) throw new Error("Stamps.com v160 WSDL did not expose a target namespace.");
  cachedNamespace = match[1];
  return cachedNamespace;
}

async function getMailingIndiciumItemElement(wsdlUrl: string) {
  if (cachedMailingIndiciumItemElement) return cachedMailingIndiciumItemElement;
  const wsdl = await loadWsdl(wsdlUrl);
  const candidates = [...wsdl.matchAll(/name=[\"'](IndiciumInfoV(\d+))[\"']/gi)]
    .map((match) => ({ name: match[1], version: Number(match[2]) }))
    .filter((candidate) => Number.isFinite(candidate.version))
    .sort((a, b) => b.version - a.version);
  if (!candidates[0]?.name) throw new Error("Stamps.com v160 WSDL did not expose a mailing indicium item type.");
  cachedMailingIndiciumItemElement = candidates[0].name;
  return cachedMailingIndiciumItemElement;
}

async function soapCall(operation: string, body: string) {
  const config = getStampsConfiguration();
  if (config.mode !== "staging") throw new Error("Single-card proof is locked to STAMPS_MODE=staging.");
  if (!config.configured || !config.endpointUrl || !config.wsdlUrl) throw new Error("Stamps.com staging is not configured.");

  const namespace = await getNamespace(config.wsdlUrl);
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

  console.info("Stamps SWS/IM staging SOAP exchange", {
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

  return responseXml;
}

function credentialsXml() {
  const { credentials } = getStampsConfiguration();
  return `<sws:Credentials><sws:IntegrationID>${escapeXml(credentials.integrationId)}</sws:IntegrationID><sws:Username>${escapeXml(credentials.username)}</sws:Username><sws:Password>${escapeXml(credentials.password)}</sws:Password></sws:Credentials>`;
}

function addressXml(address: PostcardAddress) {
  return `<sws:FullName>${escapeXml(address.name)}</sws:FullName><sws:Company>${escapeXml(address.name)}</sws:Company><sws:Address1>${escapeXml(address.street)}</sws:Address1><sws:City>${escapeXml(address.city)}</sws:City><sws:State>${escapeXml(address.state)}</sws:State><sws:ZIPCode>${escapeXml(address.zip)}</sws:ZIPCode>`;
}

function cleansedAddressXml(address: CleansedStampsAddress, includeHash: boolean) {
  return `<sws:FullName>${escapeXml(address.name)}</sws:FullName><sws:Company>${escapeXml(address.name)}</sws:Company><sws:Address1>${escapeXml(address.street)}</sws:Address1><sws:Address2>${escapeXml(address.address2)}</sws:Address2><sws:City>${escapeXml(address.city)}</sws:City><sws:State>${escapeXml(address.state)}</sws:State><sws:ZIPCode>${escapeXml(address.zip)}</sws:ZIPCode><sws:ZIPCodeAddOn>${escapeXml(address.zip4)}</sws:ZIPCodeAddOn><sws:DPB>${escapeXml(address.dpb)}</sws:DPB><sws:CheckDigit>${escapeXml(address.checkDigit)}</sws:CheckDigit><sws:Urbanization>${escapeXml(address.urbanization)}</sws:Urbanization>${includeHash ? `<sws:CleanseHash>${escapeXml(address.cleanseHash)}</sws:CleanseHash>` : ""}`;
}

function originXml() {
  return `<sws:FullName>${escapeXml(ORIGIN.fullName)}</sws:FullName><sws:Company>${escapeXml(ORIGIN.company)}</sws:Company><sws:Address1>${escapeXml(ORIGIN.address1)}</sws:Address1><sws:Address2>${escapeXml(ORIGIN.address2)}</sws:Address2><sws:City>${escapeXml(ORIGIN.city)}</sws:City><sws:State>${escapeXml(ORIGIN.state)}</sws:State><sws:ZIPCode>${escapeXml(ORIGIN.zip)}</sws:ZIPCode>`;
}

function findPostcardRate(responseXml: string) {
  const blocks = responseXml.match(/<(?:[A-Za-z0-9_-]+:)?Rate(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z0-9_-]+:)?Rate>/gi) || [];
  const postcard = blocks.find((block) => readXmlTag(block, "PackageType") === "Postcard" && readXmlTag(block, "ServiceType") === "US-FC") || blocks.find((block) => readXmlTag(block, "PackageType") === "Postcard");
  if (!postcard) throw new Error("Stamps.com did not return a USPS postcard rate for the test address.");
  const amountRaw = readXmlTag(postcard, "Amount");
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount)) throw new Error("Stamps.com returned a postcard rate without an amount.");
  return {
    amount,
    serviceType: readXmlTag(postcard, "ServiceType") || "US-FC",
    packageType: readXmlTag(postcard, "PackageType") || "Postcard",
    shipDate: readXmlTag(postcard, "ShipDate") || new Date().toISOString().slice(0, 10),
  };
}

function mailingLabelRateXml(rate: { amount: number; serviceType: string; packageType: string; shipDate: string }, to: CleansedStampsAddress) {
  return `<sws:Rate><sws:From>${originXml()}</sws:From><sws:To>${cleansedAddressXml(to, true)}</sws:To><sws:Amount>${rate.amount.toFixed(4)}</sws:Amount><sws:ServiceType>${escapeXml(rate.serviceType)}</sws:ServiceType><sws:PrintLayout>Default</sws:PrintLayout><sws:WeightLb>${POSTCARD.weightLb}</sws:WeightLb><sws:WeightOz>${POSTCARD.weightOz}</sws:WeightOz><sws:PackageType>${escapeXml(rate.packageType)}</sws:PackageType><sws:Length>${POSTCARD.length}</sws:Length><sws:Width>${POSTCARD.width}</sws:Width><sws:Height>${POSTCARD.height}</sws:Height><sws:ShipDate>${escapeXml(rate.shipDate)}</sws:ShipDate><sws:NonMachinable>false</sws:NonMachinable><sws:RectangularShaped>true</sws:RectangularShaped></sws:Rate>`;
}

export async function runSinglePostcardStagingProof(address: PostcardAddress): Promise<StagingPostcardProofResult> {
  const config = getStampsConfiguration();
  if (config.mode !== "staging") throw new Error("This test is available only in Stamps.com staging mode.");
  if (!config.postcardEnabled) throw new Error("Stamps.com postcard access is not enabled.");

  const accountXml = await soapCall("GetAccountInfo", credentialsXml());
  const auth1 = readXmlTag(accountXml, "Authenticator");
  if (!auth1) throw new Error("Stamps.com authenticated but did not return an Authenticator.");

  const cleanseXml = await soapCall(
    "CleanseAddress",
    `<sws:Authenticator>${escapeXml(auth1)}</sws:Authenticator><sws:Address>${addressXml(address)}</sws:Address><sws:FromZIPCode>${ORIGIN.zip}</sws:FromZIPCode>`,
  );
  const auth2 = readXmlTag(cleanseXml, "Authenticator");
  if (!auth2) throw new Error("Stamps.com CleanseAddress did not return the next Authenticator.");

  const addressMatch = readBoolean(cleanseXml, "AddressMatch");
  const cityStateZipOk = readBoolean(cleanseXml, "CityStateZipOK");
  if (!cityStateZipOk) throw new Error("Stamps.com could not validate the city, state, and ZIP for this test postcard.");

  const cleanseHash = readXmlTag(cleanseXml, "CleanseHash") || "";
  const returnCode = readXmlTag(cleanseXml, "ReturnCode");
  if (!addressMatch || !cleanseHash) {
    const detail = returnCode ? ` Stamps return code: ${returnCode}.` : "";
    throw new Error(`Stamps.com did not confirm this destination as a deliverable USPS address.${detail} Use a real, deliverable business address for the staging proof; demo or placeholder addresses cannot generate an indicium.`);
  }

  const cleansedExact: CleansedStampsAddress = {
    name: readXmlTag(cleanseXml, "Company") || readXmlTag(cleanseXml, "FullName") || address.name,
    street: readXmlTag(cleanseXml, "Address1") || address.street,
    address2: readXmlTag(cleanseXml, "Address2") || "",
    city: readXmlTag(cleanseXml, "City") || address.city,
    state: readXmlTag(cleanseXml, "State") || address.state,
    zip: readXmlTag(cleanseXml, "ZIPCode") || address.zip,
    zip4: readXmlTag(cleanseXml, "ZIPCodeAddOn") || "",
    dpb: readXmlTag(cleanseXml, "DPB") || "",
    checkDigit: readXmlTag(cleanseXml, "CheckDigit") || "",
    urbanization: readXmlTag(cleanseXml, "Urbanization") || "",
    cleanseHash,
  };

  const cleansed: PostcardAddress & { zip4?: string | null } = {
    name: cleansedExact.name,
    street: cleansedExact.street,
    city: cleansedExact.city,
    state: cleansedExact.state,
    zip: cleansedExact.zip,
    zip4: cleansedExact.zip4 || null,
  };

  const shipDate = new Date().toISOString().slice(0, 10);
  const ratesXml = await soapCall(
    "GetRates",
    `<sws:Authenticator>${escapeXml(auth2)}</sws:Authenticator><sws:Rate><sws:From>${originXml()}</sws:From><sws:To>${cleansedAddressXml(cleansedExact, false)}</sws:To><sws:WeightLb>${POSTCARD.weightLb}</sws:WeightLb><sws:WeightOz>${POSTCARD.weightOz}</sws:WeightOz><sws:PackageType>Postcard</sws:PackageType><sws:Length>${POSTCARD.length}</sws:Length><sws:Width>${POSTCARD.width}</sws:Width><sws:Height>${POSTCARD.height}</sws:Height><sws:ShipDate>${shipDate}</sws:ShipDate><sws:NonMachinable>false</sws:NonMachinable><sws:RectangularShaped>true</sws:RectangularShaped></sws:Rate><sws:Carrier>USPS</sws:Carrier>`,
  );
  const auth3 = readXmlTag(ratesXml, "Authenticator");
  if (!auth3) throw new Error("Stamps.com GetRates did not return the next Authenticator.");
  const rate = findPostcardRate(ratesXml);

  const integratorTxId = `toh-postcard-stage-${randomUUID()}`;
  if (!config.wsdlUrl) throw new Error("Stamps.com staging WSDL is not configured.");
  const indiciumItemElement = await getMailingIndiciumItemElement(config.wsdlUrl);
  const indiciumXml = await soapCall(
    "CreateMailingLabelIndicia",
    `<sws:Authenticator>${escapeXml(auth3)}</sws:Authenticator><sws:IntegratorTxId>${escapeXml(integratorTxId)}</sws:IntegratorTxId><sws:Layout>SDC3110</sws:Layout><sws:PrintToAddress>false</sws:PrintToAddress><sws:StartRow>0</sws:StartRow><sws:StartColumn>0</sws:StartColumn><sws:IndiciumInfo><sws:${indiciumItemElement}>${mailingLabelRateXml(rate, cleansedExact)}</sws:${indiciumItemElement}></sws:IndiciumInfo><sws:Mode>Normal</sws:Mode><sws:ImageType>Png</sws:ImageType><sws:BypassCleanseAddress>false</sws:BypassCleanseAddress><sws:ReturnIndiciumData>false</sws:ReturnIndiciumData><sws:ImageId>0</sws:ImageId><sws:PrintFromAddress>false</sws:PrintFromAddress>`,
  );

  return {
    ok: true,
    businessName: address.name,
    originalAddress: address,
    cleansedAddress: cleansed,
    addressMatch,
    cityStateZipOk,
    amount: rate.amount,
    serviceType: rate.serviceType,
    packageType: rate.packageType,
    shipDate: rate.shipDate,
    stampsTxId: readXmlTag(indiciumXml, "StampsTxID") || readXmlTag(indiciumXml, "StampsTxId"),
    integratorTxId,
    labelUrl: readXmlTag(indiciumXml, "Url"),
    imageDataBase64: null,
    sampleOnly: false,
    warning: "STAGING TEST ONLY — never place this indicium into the USPS mailstream. Destroy any printed copy immediately after testing.",
  };
}
