import { NextRequest, NextResponse } from "next/server";
import { listBusinessCRMPage } from "@/lib/admin-crm";
import {
  isThreeCxAuthorized,
  normalizePhone,
  phoneLookupSuffix,
  splitContactName,
} from "@/lib/integrations/three-cx";

export const dynamic = "force-dynamic";

function rowPhoneCandidates(row: any) {
  return [
    row.phone,
    row.phone_number,
    row.webmaster_phone,
    row.claimant_phone,
  ].filter(Boolean);
}

function safeLookupDiagnostics({
  rawPhone,
  normalized,
  suffix,
  candidateRows = 0,
  matches = 0,
  queryKeys = [],
}: {
  rawPhone: string;
  normalized: string;
  suffix: string;
  candidateRows?: number;
  matches?: number;
  queryKeys?: string[];
}) {
  return {
    receivedPhone: Boolean(rawPhone),
    receivedDigitCount: normalized.length,
    receivedSuffix: suffix || null,
    queryKeys,
    candidateRows,
    matches,
  };
}

export async function GET(request: NextRequest) {
  if (!isThreeCxAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const queryKeys = Array.from(request.nextUrl.searchParams.keys()).sort();
  const rawPhone =
    request.nextUrl.searchParams.get("phone") ||
    request.nextUrl.searchParams.get("number") ||
    "";
  const normalized = normalizePhone(rawPhone);
  const suffix = phoneLookupSuffix(normalized);

  if (normalized.length < 7) {
    return NextResponse.json({
      contacts: [],
      diagnostics: safeLookupDiagnostics({
        rawPhone,
        normalized,
        suffix,
        queryKeys,
      }),
    });
  }

  const pageData = await listBusinessCRMPage({
    page: 1,
    pageSize: 100,
    query: suffix,
    filter: "all",
    market: "all",
    permittedLocationIds: null,
  });

  const matches = pageData.rows.filter((row: any) =>
    rowPhoneCandidates(row).some(
      (candidate) => normalizePhone(candidate) === normalized,
    ),
  );

  const contacts = matches.map((row: any) => {
    const company = String(
      row.location_name || row.name || "TheOutHaven location",
    );
    const { firstName, lastName } = splitContactName(company);
    const matchedPhone =
      rowPhoneCandidates(row).find(
        (candidate) => normalizePhone(candidate) === normalized,
      ) || rawPhone;

    return {
      id: String(row.location_id || row.id),
      firstName,
      lastName,
      company,
      email: row.owner_email || row.email || "",
      businessPhone: matchedPhone,
      city: row.city || "",
      state: row.state || "",
      profileUrl: `https://www.theouthaven.com/admin/dashboard/crm/${row.location_id || row.id}?tab=communication`,
    };
  });

  return NextResponse.json({
    contacts,
    diagnostics: safeLookupDiagnostics({
      rawPhone,
      normalized,
      suffix,
      candidateRows: pageData.rows.length,
      matches: contacts.length,
      queryKeys,
    }),
  });
}
