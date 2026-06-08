import { handleOptions } from "../_shared/cors.ts";
import { jsonResponse, ok } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { logCronJobRun } from "../_shared/cronLogger.ts";

type EntryRow = Record<string, unknown>;

type ReviewEntry = {
  id: string;
  name: string;
  email: string;
  socialHandle: string;
  createdAt: string;
  status: string;
  duplicate: boolean;
  missing: string[];
};

const SOURCE = "admin-giveaway-review-reminder";
const SUBJECT = "TheOutHaven Giveaway Review Reminder";
const PREHEADER =
  "Users still need email verification, follow, tags, or social handle review.";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function env(name: string) {
  return Deno.env.get(name)?.trim() || "";
}

function requireEnv(name: string) {
  if (!env(name)) throw new Error(`Missing ${name}`);
}

function siteUrl() {
  return (
    env("NEXT_PUBLIC_SITE_URL") ||
    env("SITE_URL") ||
    "https://theouthaven.com"
  ).replace(/\/$/, "");
}

function recipients() {
  return (
    env("GIVEAWAY_REVIEW_DIGEST_TO") ||
    env("SEARCH_HEALTH_DIGEST_TO") ||
    env("ADMIN_EMAIL")
  )
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isTrue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hasHandle(row: EntryRow) {
  const handle = clean(row.social_handle || row.instagram_handle || row.handle);
  return Boolean(handle && handle !== "@");
}

function displayHandle(row: EntryRow) {
  return clean(row.social_handle || row.instagram_handle || row.handle) || "—";
}

function displayName(row: EntryRow) {
  return (
    clean(
      row.full_name || row.name || [row.first_name].filter(Boolean).join(" "),
    ) || "Launch List Member"
  );
}

function status(row: EntryRow) {
  return clean(row.giveaway_status || row.entry_status || row.status);
}

function isGiveawayEntry(row: EntryRow) {
  if ("wants_giveaway" in row) return isTrue(row.wants_giveaway);
  const current = status(row).toLowerCase();
  return current !== "not_entered";
}

function missingItems(row: EntryRow) {
  const missing: string[] = [];
  if (
    ("email_verified" in row && !isTrue(row.email_verified)) ||
    ("is_email_verified" in row && !isTrue(row.is_email_verified)) ||
    ("verified_email" in row && !isTrue(row.verified_email)) ||
    ("email_verified_at" in row && !row.email_verified_at)
  ) {
    missing.push("Verify your email");
  }
  if (
    ("social_follow_verified" in row && !isTrue(row.social_follow_verified)) ||
    ("social_follow_confirmed" in row &&
      !isTrue(row.social_follow_confirmed)) ||
    ("followed_verified" in row && !isTrue(row.followed_verified)) ||
    ("followed_social" in row && !isTrue(row.followed_social)) ||
    ("followed" in row && !isTrue(row.followed)) ||
    ("followed_us" in row && !isTrue(row.followed_us)) ||
    ("followed_theouthaven" in row && !isTrue(row.followed_theouthaven))
  ) {
    missing.push("Follow @TheOutHaven");
  }
  if (
    ("tagged_friends_verified" in row &&
      !isTrue(row.tagged_friends_verified)) ||
    ("tagged_friends_confirmed" in row &&
      !isTrue(row.tagged_friends_confirmed)) ||
    ("tagged_2_friends" in row && !isTrue(row.tagged_2_friends)) ||
    ("tagged_friends" in row && !isTrue(row.tagged_friends)) ||
    ("tagged_two_friends" in row && !isTrue(row.tagged_two_friends))
  ) {
    missing.push("Tag 2 friends on the giveaway post");
  }
  if (!hasHandle(row)) missing.push("Add your Instagram/social handle");
  return [...new Set(missing)];
}

function possibleDuplicate(row: EntryRow) {
  return (
    isTrue(row.duplicate_flag) ||
    isTrue(row.is_duplicate) ||
    Boolean(row.duplicate_of)
  );
}

function summarize(rows: EntryRow[]) {
  const giveawayRows = rows.filter(isGiveawayEntry);
  const entries: ReviewEntry[] = giveawayRows
    .map((row) => ({
      id: String(row.id || ""),
      name: displayName(row),
      email: clean(row.email) || "—",
      socialHandle: displayHandle(row),
      createdAt: clean(row.created_at),
      status: status(row) || "—",
      duplicate: possibleDuplicate(row),
      missing: missingItems(row),
    }))
    .filter((entry) => entry.missing.length > 0);

  return {
    entries,
    counts: {
      totalGiveawayOptIns: giveawayRows.length,
      totalChecked: rows.length,
      totalNeedingReview: entries.length,
      missingEmailVerification: entries.filter((entry) =>
        entry.missing.includes("Verify your email"),
      ).length,
      missingFollow: entries.filter((entry) =>
        entry.missing.includes("Follow @TheOutHaven"),
      ).length,
      missingTwoFriendTags: entries.filter((entry) =>
        entry.missing.includes("Tag 2 friends on the giveaway post"),
      ).length,
      missingHandle: entries.filter((entry) =>
        entry.missing.includes("Add your Instagram/social handle"),
      ).length,
      possibleDuplicates: entries.filter((entry) => entry.duplicate).length,
    },
  };
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", { timeZone: "America/New_York" });
}

function buildEmail(
  entries: ReviewEntry[],
  counts: ReturnType<typeof summarize>["counts"],
) {
  const adminUrl = `${siteUrl()}/admin/dashboard/giveaway`;
  const generated = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
  });
  const logoUrl = `${siteUrl()}/toh_logo.png`;
  const summaryRows = [
    ["Total needing review", counts.totalNeedingReview],
    ["Total giveaway opt-ins", counts.totalGiveawayOptIns],
    ["Total checked", counts.totalChecked],
    ["Missing email verification", counts.missingEmailVerification],
    ["Missing follow", counts.missingFollow],
    ["Missing 2 friend tags", counts.missingTwoFriendTags],
    ["Missing handle", counts.missingHandle],
    ["Possible duplicates", counts.possibleDuplicates],
  ];
  const summaryHtml = summaryRows.map(
    ([label, value]) =>
      `<td style="width:50%;padding:6px;"><div style="border:1px solid #2a211d;border-radius:16px;background:#1c1614;padding:14px;"><div style="color:#b8aaa4;font-size:11px;text-transform:uppercase;letter-spacing:.12em;font-weight:800;">${escapeHtml(label)}</div><div style="margin-top:8px;color:#ffffff;font-size:24px;font-weight:900;">${escapeHtml(value)}</div></div></td>`,
  );
  const entryHtml = entries
    .slice(0, 25)
    .map(
      (entry) =>
        `<div style="border-top:1px solid #2a211d;padding:16px 0;"><div style="color:#ffffff;font-size:16px;font-weight:900;">${escapeHtml(entry.name)}</div><div style="margin-top:5px;color:#b8aaa4;font-size:14px;line-height:21px;">${escapeHtml(entry.email)} · ${escapeHtml(entry.socialHandle)}</div><div style="margin-top:8px;color:#ffffff;font-size:13px;line-height:20px;"><strong>Missing:</strong><ul style="margin:6px 0 0 18px;padding:0;">${entry.missing.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div><div style="margin-top:8px;color:#8f817a;font-size:12px;line-height:18px;">Created: ${escapeHtml(formatDate(entry.createdAt))} · Status: ${escapeHtml(entry.status)}</div></div>`,
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${SUBJECT}</title></head><body style="margin:0;padding:0;background:#090706;font-family:Arial,Helvetica,sans-serif;color:#ffffff;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${PREHEADER}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#090706;padding:34px 14px;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;border:1px solid #2a211d;border-radius:28px;overflow:hidden;background:#14100c;"><tr><td style="padding:30px;border-bottom:1px solid #2a211d;background:#14100c;"><img src="${escapeHtml(logoUrl)}" alt="TheOutHaven" width="96" style="display:block;width:96px;max-width:96px;height:auto;border:0;outline:none;text-decoration:none;"><h1 style="margin:22px 0 0;color:#ffffff;font-size:30px;line-height:38px;font-weight:900;">Giveaway Review Reminder</h1><p style="margin:10px 0 0;color:#b8aaa4;font-size:14px;line-height:22px;">Generated ${escapeHtml(generated)} ET</p><p style="margin:16px 0 0;color:#b8aaa4;font-size:16px;line-height:25px;">These giveaway entries still need verification before they are ready for drawing.</p></td></tr><tr><td style="padding:30px;"><h2 style="margin:0 0 12px;color:#ffffff;font-size:18px;">Summary</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${summaryHtml.slice(0, 2).join("")}</tr><tr>${summaryHtml.slice(2, 4).join("")}</tr><tr>${summaryHtml.slice(4, 6).join("")}</tr><tr>${summaryHtml.slice(6, 8).join("")}</tr></table><h2 style="margin:28px 0 0;color:#ffffff;font-size:18px;">Entries needing review</h2>${entryHtml}<div style="margin-top:28px;"><a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#dc2626;color:#ffffff;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:900;">Open Giveaway Admin</a></div><p style="margin:12px 0 0;color:#8f817a;font-size:12px;line-height:18px;word-break:break-all;">${escapeHtml(adminUrl)}</p></td></tr></table></td></tr></table></body></html>`;
  const text = [
    "TheOutHaven Giveaway Review Reminder",
    `Generated ${generated} ET`,
    `Total needing review: ${counts.totalNeedingReview}`,
    `Total giveaway opt-ins: ${counts.totalGiveawayOptIns}`,
    `Total checked: ${counts.totalChecked}`,
    `Missing email verification: ${counts.missingEmailVerification}`,
    `Missing follow: ${counts.missingFollow}`,
    `Missing 2 friend tags: ${counts.missingTwoFriendTags}`,
    `Missing handle: ${counts.missingHandle}`,
    `Possible duplicates: ${counts.possibleDuplicates}`,
    `Open admin: ${adminUrl}`,
  ].join("\n");
  return { html, text };
}

async function sendEmail(to: string[], html: string, text: string) {
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey) throw new Error("Missing RESEND_API_KEY");
  const from =
    env("EMAIL_FROM") ||
    env("SEARCH_HEALTH_DIGEST_FROM") ||
    "TheOutHaven Admin <admin@theouthaven.com>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject: SUBJECT, html, text }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message ?? response.statusText);
  return data?.id ?? null;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  const startedAt = new Date().toISOString();
  let supabase: ReturnType<typeof createSupabaseAdminClient> | null = null;
  let source = "cron";

  try {
    requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    requireEnv("CRON_SECRET");
    if (req.headers.get("x-cron-secret") !== env("CRON_SECRET")) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    source = String(body.source || (dryRun ? "manual_dry_run" : "cron"));
    supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("launch_waitlist_signups")
      .select(
        "id,full_name,email,social_handle,social_platform,wants_giveaway,email_verified,email_verified_at,followed_social,tagged_two_friends,giveaway_status,duplicate_flag,created_at,updated_at,giveaway_verified_at",
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;

    const rows = data || [];
    const { entries, counts } = summarize(rows);
    const preview = entries.slice(0, 10).map((entry) => ({
      id: entry.id,
      name: entry.name,
      email: entry.email,
      socialHandle: entry.socialHandle,
      missing: entry.missing,
      status: entry.status,
    }));

    if (!entries.length) {
      const response = {
        success: true,
        source: SOURCE,
        dryRun,
        checked: rows.length,
        needsReview: 0,
        sent: false,
        recipientCount: 0,
        counts,
        preview,
        skipped: true,
        reason: "no_entries_needing_review",
        message: "No giveaway entries need review.",
      };
      await logCronJobRun(supabase, {
        job_name: SOURCE,
        function_name: SOURCE,
        source,
        status: "skipped",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        checked_count: rows.length,
        skipped_count: rows.length,
        metadata: response,
      });
      return ok(response);
    }

    const to = recipients();
    if (!to.length) {
      return jsonResponse(
        {
          success: false,
          source: SOURCE,
          dryRun,
          checked: rows.length,
          needsReview: entries.length,
          sent: false,
          recipientCount: 0,
          counts,
          preview,
          error: "Missing GIVEAWAY_REVIEW_DIGEST_TO",
          message: "Missing GIVEAWAY_REVIEW_DIGEST_TO",
        },
        500,
      );
    }

    let sent = false;
    let emailId = null;
    if (!dryRun) {
      const email = buildEmail(entries, counts);
      emailId = await sendEmail(to, email.html, email.text);
      sent = true;
    }

    const response = {
      success: true,
      source: SOURCE,
      dryRun,
      checked: rows.length,
      needsReview: entries.length,
      sent,
      recipientCount: to.length,
      counts,
      preview,
      message: dryRun
        ? "Dry run completed."
        : "Admin giveaway review reminder sent.",
      emailId,
    };
    await logCronJobRun(supabase, {
      job_name: SOURCE,
      function_name: SOURCE,
      source,
      status: "success",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      checked_count: rows.length,
      success_count: entries.length,
      skipped_count: rows.length - entries.length,
      metadata: { sent, recipientCount: to.length, dryRun },
    });
    return ok(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (supabase)
      await logCronJobRun(supabase, {
        job_name: SOURCE,
        function_name: SOURCE,
        source,
        status: "failed",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        failed_count: 1,
        error_message: message,
      });
    return jsonResponse(
      { success: false, source: SOURCE, error: message },
      500,
    );
  }
});
