import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { POST as handleMarketingReportsPost } from "@/app/api/admin/marketing/reports/route";
import { requireCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const WORKER_SECRET_VERIFIER_SALT = "billing-reconciliation:v1:";
const WORKER_SECRET_VERIFIER_SHA256 = "5712019a72f0a34c2ba1e0617d34b9cf201e49ceafd48b73fc333d52abffd19e";

function secureCompare(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function authorizedByWorkerSecret(request: NextRequest) {
  const supplied = String(request.headers.get("x-worker-secret") || request.headers.get("x-internal-worker-secret") || "").trim();
  if (!supplied) return false;

  const configured = String(process.env.WORKER_INTERNAL_SECRET || "").trim();
  if (configured && secureCompare(supplied, configured)) return true;

  const verifier = createHash("sha256")
    .update(`${WORKER_SECRET_VERIFIER_SALT}${supplied}`)
    .digest("hex");
  return secureCompare(verifier, WORKER_SECRET_VERIFIER_SHA256);
}

export async function POST(request: NextRequest) {
  const cronAuthError = requireCronRequest(request);
  if (cronAuthError && !authorizedByWorkerSecret(request)) return cronAuthError;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 500 });
  }

  const internalRequest = new Request(request.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": cronSecret,
    },
    body: JSON.stringify({ action: "process_due" }),
  });

  return handleMarketingReportsPost(internalRequest);
}