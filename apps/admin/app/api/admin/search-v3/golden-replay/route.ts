import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getCredentialVaultRuntimeSnapshot } from "@/lib/aws/admin-credential-vault";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  if (typeof body.reason !== "string" || body.reason.trim().length < 8) {
    return NextResponse.json({ error: "Provide an audit reason with at least eight characters." }, { status: 400 });
  }

  try {
    const vault = await getCredentialVaultRuntimeSnapshot("production");
    const token = String(vault.providers.github?.token || "").trim();
    if (!token) {
      return NextResponse.json({ error: "GitHub workflow token is not configured in the AWS credential vault." }, { status: 503 });
    }

    // Use a fixed trusted repository, workflow and production branch.
    const workflow = "search-v3-production-golden-replay.yml";
    const response = await fetch(
      "https://api.github.com/repos/DevSoft-Development/roseout/actions/workflows/" + workflow + "/dispatches",
      {
        method: "POST",
        cache: "no-store",
        headers: {
          accept: "application/vnd.github+json",
          authorization: "Bearer " + token,
          "content-type": "application/json",
          "user-agent": "TheOutHaven-SearchV3-Admin",
          "x-github-api-version": "2022-11-28",
        },
        body: JSON.stringify({ ref: "main" }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) {
      return NextResponse.json({ error: "Golden Replay workflow dispatch failed (HTTP " + response.status + ")." }, { status: 502 });
    }

    const { error: auditError } = await getAdminDatabaseClient().from("admin_audit_logs").insert({
      actor_user_id: auth.adminUser!.user_id,
      action: "search_v3_golden_replay.requested",
      entity_type: "github_workflow",
      entity_id: workflow,
      summary: body.reason.trim(),
      metadata: { ref: "main", requested_at: new Date().toISOString() },
    });
    if (auditError) {
      return NextResponse.json({
        error: "Workflow dispatched but audit persistence failed; notify an administrator.",
        workflowUrl: "https://github.com/DevSoft-Development/roseout/actions/workflows/" + workflow,
      }, { status: 500 });
    }

    return NextResponse.json({
      dispatched: true,
      workflowUrl: "https://github.com/DevSoft-Development/roseout/actions/workflows/" + workflow,
      note: "This workflow generates a replay artifact; it does not by itself authorize Search V3 promotion.",
    }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Unable to dispatch Golden Replay from AWS Admin." }, { status: 503 });
  }
}
