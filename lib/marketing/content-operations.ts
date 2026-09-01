import "server-only";

import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ensureCrmTaskForSource, mutateTask } from "@/lib/crm/tasks/service";
import type { TaskActor } from "@/lib/crm/tasks/types";
import { syncMicrosoft365TasksWithCrm } from "@/lib/microsoft-365/task-crm-sync";

export const CONTENT_PLATFORMS = ["instagram", "facebook", "tiktok", "youtube"] as const;
export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number];

const MEANINGFUL_FIELDS = new Set([
  "title",
  "source_type",
  "source_id",
  "location_id",
  "content_type",
  "occasion",
  "market",
  "neighborhood",
  "budget_category",
  "publish_at",
  "selected_platforms",
  "media_urls",
  "caption",
  "platform_copy",
  "hook",
  "script",
  "voiceover",
  "cta",
  "auto_publish",
]);

export type MarketingContentRow = {
  id: string;
  scope: string;
  campaign_id: string | null;
  location_id: string | null;
  organization_id: string | null;
  source_type: string | null;
  source_id: string | null;
  title: string;
  content_type: string;
  occasion: string | null;
  market: string | null;
  neighborhood: string | null;
  budget_category: string | null;
  owner_user_id: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  publish_at: string | null;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  approved_version: number | null;
  current_version: number;
  selected_platforms: string[] | null;
  media_urls: string[] | null;
  caption: string | null;
  platform_copy: Record<string, unknown> | null;
  auto_publish: boolean;
  approval_hash: string | null;
  hook: string | null;
  script: string | null;
  voiceover: string | null;
  cta: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizePlatforms(value: unknown): ContentPlatform[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).filter((item): item is ContentPlatform =>
    (CONTENT_PLATFORMS as readonly string[]).includes(item),
  ))];
}

export function isMeaningfulContentPatch(patch: Record<string, unknown>) {
  return Object.keys(patch).some((key) => MEANINGFUL_FIELDS.has(key));
}

export function contentSnapshot(content: MarketingContentRow) {
  return {
    id: content.id,
    scope: content.scope,
    campaign_id: content.campaign_id,
    location_id: content.location_id,
    organization_id: content.organization_id,
    source_type: content.source_type,
    source_id: content.source_id,
    title: content.title,
    content_type: content.content_type,
    occasion: content.occasion,
    market: content.market,
    neighborhood: content.neighborhood,
    budget_category: content.budget_category,
    owner_user_id: content.owner_user_id,
    priority: content.priority,
    due_at: content.due_at,
    publish_at: content.publish_at,
    selected_platforms: normalizePlatforms(content.selected_platforms),
    media_urls: content.media_urls || [],
    caption: content.caption,
    platform_copy: content.platform_copy || {},
    auto_publish: Boolean(content.auto_publish),
    hook: content.hook,
    script: content.script,
    voiceover: content.voiceover,
    cta: content.cta,
    metadata: content.metadata || {},
  };
}

export function contentApprovalHash(content: MarketingContentRow) {
  return createHash("sha256").update(JSON.stringify(contentSnapshot(content))).digest("hex");
}

export async function loadMarketingContent(id: string) {
  const { data, error } = await supabaseAdmin
    .from("marketing_content_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Marketing content not found.");
  return data as MarketingContentRow;
}

export async function taskActorForUser(userId: string): Promise<TaskActor | null> {
  const { data } = await supabaseAdmin
    .from("admin_users")
    .select("user_id,email,role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.user_id || !data.role) return null;
  return { user_id: data.user_id, email: data.email || null, role: data.role as TaskActor["role"] };
}

export async function resolveMarketingApprover(preferredUserId?: string | null) {
  if (preferredUserId) {
    const { data } = await supabaseAdmin
      .from("admin_users")
      .select("user_id,email,role")
      .eq("user_id", preferredUserId)
      .in("role", ["marketing_manager", "superadmin", "admin"])
      .maybeSingle();
    if (data?.user_id) return data;
  }

  const { data } = await supabaseAdmin
    .from("admin_users")
    .select("user_id,email,role,created_at")
    .in("role", ["marketing_manager", "superadmin", "admin"])
    .order("created_at", { ascending: true })
    .limit(50);

  const rows = data || [];
  return rows.find((row) => row.role === "marketing_manager")
    || rows.find((row) => row.role === "superadmin")
    || rows.find((row) => row.role === "admin")
    || null;
}

async function bestEffortTodoSync(userId: string | null | undefined) {
  if (!userId) return;
  try {
    await syncMicrosoft365TasksWithCrm(userId);
  } catch (error) {
    console.warn("Marketing CRM task created but Microsoft To Do sync could not run immediately", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function ensurePublishingReminder(content: MarketingContentRow, actor: TaskActor) {
  if (!content.owner_user_id || !content.publish_at) return null;
  const publishAt = new Date(content.publish_at);
  if (Number.isNaN(publishAt.getTime())) return null;
  const reminderAt = new Date(publishAt.getTime() - 30 * 60 * 1000).toISOString();
  const title = content.auto_publish
    ? `Review scheduled post before publish: ${content.title}`
    : `Publish planned marketing content: ${content.title}`;

  const result = await ensureCrmTaskForSource(
    {
      sourceSystem: "marketing",
      sourceRecordId: `${content.id}:publish-reminder`,
      taskType: "internal",
      assigned_to_user_id: content.owner_user_id,
      location_id: content.location_id,
      title,
      description: `Marketing content is planned for ${publishAt.toLocaleString("en-US", { timeZone: "America/New_York" })}. Open /admin/dashboard/marketing/content/${content.id} to review the approved version and publishing status.`,
      status: "open",
      priority: content.priority || "normal",
      queue_key: "content",
      category: "marketing",
      subtype: content.auto_publish ? "pre_publish_review" : "manual_publish",
      workflow_key: "marketing_content_publish",
      workflow_stage: "scheduled",
      due_at: reminderAt,
      reminder_at: reminderAt,
      metadata: {
        marketing_content_item_id: content.id,
        deep_link: `/admin/dashboard/marketing/content/${content.id}`,
        publish_at: content.publish_at,
        platforms: normalizePlatforms(content.selected_platforms),
      },
    }, actor,
  );

  if (!result.created) {
    await mutateTask(
      result.task.id,
      result.task.version,
      {
        title,
        assigned_to_user_id: content.owner_user_id,
        due_at: reminderAt,
        reminder_at: reminderAt,
        priority: content.priority || "normal",
        metadata: {
          ...(result.task.metadata || {}),
          marketing_content_item_id: content.id,
          deep_link: `/admin/dashboard/marketing/content/${content.id}`,
          publish_at: content.publish_at,
          platforms: normalizePlatforms(content.selected_platforms),
        },
      },
      actor,
      "Marketing publishing plan updated",
    );
  }

  await bestEffortTodoSync(content.owner_user_id);
  return result.task.id;
}

export async function syncApprovedSocialRecords(content: MarketingContentRow) {
  const platforms = normalizePlatforms(content.selected_platforms);
  const copy = content.platform_copy || {};
  const mediaUrl = (content.media_urls || [])[0] || null;
  const now = new Date().toISOString();

  for (const platform of platforms) {
    const caption = typeof copy[platform] === "string"
      ? String(copy[platform])
      : content.caption || content.cta || content.title;

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("social_posts")
      .select("id")
      .eq("content_item_id", content.id)
      .eq("platform", platform)
      .maybeSingle();
    if (existingError) throw existingError;

    let socialPostId = existing?.id as string | undefined;
    const socialPayload = {
      content_item_id: content.id,
      campaign_id: content.campaign_id,
      platform,
      caption,
      title: platform === "youtube" ? content.title : null,
      description: platform === "youtube" ? caption : null,
      voiceover_script: content.voiceover,
      cta: content.cta,
      media_url: mediaUrl,
      status: content.publish_at ? "scheduled" : "draft",
      scheduled_at: content.publish_at,
      error_message: null,
      updated_at: now,
      metadata: {
        source_type: content.source_type,
        source_id: content.source_id,
        approval_version: content.approved_version,
        approval_hash: content.approval_hash,
      },
    };

    if (socialPostId) {
      const { error } = await supabaseAdmin.from("social_posts").update(socialPayload).eq("id", socialPostId);
      if (error) throw error;
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("social_posts")
        .insert(socialPayload)
        .select("id")
        .single();
      if (error || !created?.id) throw error || new Error("Could not create social post.");
      socialPostId = created.id;
    }

    let connectionQuery = supabaseAdmin
      .from("marketing_social_connections")
      .select("id")
      .eq("scope", content.scope === "platform" ? "platform" : content.scope)
      .eq("provider", platform)
      .eq("status", "connected");
    if (content.scope === "location") {
      if (!content.location_id) throw new Error("Location-scoped social content is missing location_id.");
      connectionQuery = connectionQuery.eq("location_id", content.location_id);
    } else if (content.scope === "organization") {
      if (!content.organization_id) throw new Error("Organization-scoped social content is missing organization_id.");
      connectionQuery = connectionQuery.eq("organization_id", content.organization_id);
    }
    const { data: connection } = await connectionQuery
      .order("connected_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (connection?.id) {
      await supabaseAdmin
        .from("social_posts")
        .update({ social_connection_id: connection.id })
        .eq("id", socialPostId);
    }

    if (content.auto_publish && content.publish_at && connection?.id) {
      const { data: activeJob } = await supabaseAdmin
        .from("social_publish_jobs")
        .select("id")
        .eq("social_post_id", socialPostId)
        .in("status", ["queued", "publishing", "retrying"])
        .maybeSingle();

      if (activeJob?.id) {
        await supabaseAdmin
          .from("social_publish_jobs")
          .update({ connection_id: connection.id, scheduled_at: content.publish_at, updated_at: now })
          .eq("id", activeJob.id);
      } else {
        await supabaseAdmin.from("social_publish_jobs").insert({
          social_post_id: socialPostId,
          connection_id: connection.id,
          provider: platform,
          scheduled_at: content.publish_at,
          status: "queued",
        });
      }
    }
  }
}

export async function cancelPendingApprovalForEdit(content: MarketingContentRow, actor: TaskActor) {
  const { data: approvals } = await supabaseAdmin
    .from("marketing_approvals")
    .select("id,crm_task_id")
    .eq("content_item_id", content.id)
    .eq("status", "pending");

  for (const approval of approvals || []) {
    await supabaseAdmin
      .from("marketing_approvals")
      .update({ status: "cancelled", decision_notes: "Content changed after submission", decided_by: actor.user_id, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", approval.id);
    if (approval.crm_task_id) {
      const { data: task } = await supabaseAdmin
        .from("crm_tasks")
        .select("id,version,status")
        .eq("id", approval.crm_task_id)
        .maybeSingle();
      if (task && task.status !== "completed" && task.status !== "cancelled") {
        await mutateTask(task.id, task.version, { status: "cancelled", completion_notes: "Content changed; reapproval required." }, actor, "Approval invalidated by content edit");
      }
    }
  }
}

export async function submitMarketingContentForApproval(
  contentId: string,
  actor: TaskActor,
  preferredApproverId?: string | null,
) {
  const content = await loadMarketingContent(contentId);
  const approver = await resolveMarketingApprover(preferredApproverId);
  if (!approver?.user_id) throw new Error("No Marketing Manager, superadmin, or admin is available for approval.");

  const version = Number(content.current_version || 1);
  const snapshot = contentSnapshot(content);
  const approvalHash = contentApprovalHash(content);
  await supabaseAdmin.from("marketing_content_versions").upsert(
    { content_item_id: content.id, version, snapshot, created_by: actor.user_id },
    { onConflict: "content_item_id,version" },
  );

  const { data: approval, error: approvalError } = await supabaseAdmin
    .from("marketing_approvals")
    .insert({
      content_item_id: content.id,
      version,
      requested_by: actor.user_id,
      assigned_to: approver.user_id,
      status: "pending",
    })
    .select("id")
    .single();
  if (approvalError || !approval?.id) throw approvalError || new Error("Could not create approval record.");

  const task = await ensureCrmTaskForSource(
    {
      sourceSystem: "marketing",
      sourceRecordId: `approval:${approval.id}`,
      taskType: "internal",
      assigned_to_user_id: approver.user_id,
      location_id: content.location_id,
      title: `Approve marketing content: ${content.title}`,
      description: `Review version ${version} of this Marketing content. Open /admin/dashboard/marketing/content/${content.id}/review to approve, request changes, or reject.`,
      status: "open",
      priority: content.priority || "normal",
      queue_key: "content",
      category: "marketing",
      subtype: "content_approval",
      workflow_key: "marketing_content_approval",
      workflow_stage: "review",
      due_at: content.due_at,
      reminder_at: content.due_at,
      metadata: {
        marketing_content_item_id: content.id,
        marketing_approval_id: approval.id,
        approval_version: version,
        deep_link: `/admin/dashboard/marketing/content/${content.id}/review`,
      },
    },
    actor,
  );

  await supabaseAdmin
    .from("marketing_approvals")
    .update({ crm_task_id: task.task.id, updated_at: new Date().toISOString() })
    .eq("id", approval.id);

  await supabaseAdmin
    .from("marketing_content_items")
    .update({
      status: "ready_for_review",
      approval_status: "pending",
      approval_hash: approvalHash,
      last_submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", content.id);

  await bestEffortTodoSync(approver.user_id);
  return { approvalId: approval.id, taskId: task.task.id, approverUserId: approver.user_id };
}

export async function decideMarketingApproval(
  contentId: string,
  approvalId: string,
  decision: "approved" | "changes_requested" | "rejected",
  notes: string,
  actor: TaskActor,
) {
  const content = await loadMarketingContent(contentId);
  const { data: approval, error } = await supabaseAdmin
    .from("marketing_approvals")
    .select("id,version,status,crm_task_id,assigned_to")
    .eq("id", approvalId)
    .eq("content_item_id", contentId)
    .maybeSingle();
  if (error) throw error;
  if (!approval || approval.status !== "pending") throw new Error("This approval is no longer pending.");
  if (Number(approval.version) !== Number(content.current_version)) {
    throw new Error("Content changed after this approval was requested. Submit the current version again.");
  }
  if (content.approval_hash !== contentApprovalHash(content)) {
    throw new Error("Content no longer matches the submitted approval snapshot. Reapproval is required.");
  }

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("marketing_approvals")
    .update({ status: decision, decision_notes: notes || null, decided_by: actor.user_id, decided_at: now, updated_at: now })
    .eq("id", approval.id);

  if (decision === "approved") {
    const nextStatus = content.publish_at ? "scheduled" : "approved";
    await supabaseAdmin
      .from("marketing_content_items")
      .update({
        status: nextStatus,
        approval_status: "approved",
        approved_by: actor.user_id,
        approved_at: now,
        approved_version: content.current_version,
        updated_at: now,
      })
      .eq("id", content.id);

    const approvedContent = await loadMarketingContent(content.id);
    await syncApprovedSocialRecords(approvedContent);
    await ensurePublishingReminder(approvedContent, actor);
  } else {
    await supabaseAdmin
      .from("marketing_content_items")
      .update({
        status: decision === "changes_requested" ? "changes_requested" : "draft",
        approval_status: decision,
        approved_by: null,
        approved_at: null,
        approved_version: null,
        updated_at: now,
      })
      .eq("id", content.id);

    if (decision === "changes_requested" && content.owner_user_id) {
      await ensureCrmTaskForSource(
        {
          sourceSystem: "marketing",
          sourceRecordId: `${content.id}:revision:${content.current_version}`,
          taskType: "internal",
          assigned_to_user_id: content.owner_user_id,
          location_id: content.location_id,
          title: `Revise marketing content: ${content.title}`,
          description: `${notes || "Changes were requested."}\n\nOpen /admin/dashboard/marketing/content/${content.id} to revise and resubmit.`,
          status: "open",
          priority: content.priority || "normal",
          queue_key: "content",
          category: "marketing",
          subtype: "content_revision",
          workflow_key: "marketing_content_approval",
          workflow_stage: "revision",
          due_at: content.due_at,
          reminder_at: content.due_at,
          metadata: { marketing_content_item_id: content.id, deep_link: `/admin/dashboard/marketing/content/${content.id}` },
        },
        actor,
      );
      await bestEffortTodoSync(content.owner_user_id);
    }
  }

  if (approval.crm_task_id) {
    const { data: task } = await supabaseAdmin
      .from("crm_tasks")
      .select("id,version,status")
      .eq("id", approval.crm_task_id)
      .maybeSingle();
    if (task && task.status !== "completed" && task.status !== "cancelled") {
      await mutateTask(
        task.id,
        task.version,
        { status: "completed", completion_notes: `Marketing approval: ${decision}${notes ? ` — ${notes}` : ""}` },
        actor,
        `Marketing approval ${decision}`,
      );
    }
  }

  await bestEffortTodoSync(approval.assigned_to);
  return loadMarketingContent(content.id);
}
