import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { renderEnterpriseEmail, sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedRoles = new Set([
  "manager",
  "editor",
  "reviewer",
  "ambassador",
  "experience",
  "partner_ambassador",
  "experience_team",
  "viewer",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmailPart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".")
    .slice(0, 48);
}

function emailCandidates(firstName: string, lastName: string) {
  const first = normalizeEmailPart(firstName);
  const last = normalizeEmailPart(lastName);
  if (!first) throw new Error("Candidate first name is required.");
  const result = [`${first}@theouthaven.com`];
  if (last) result.push(`${first}.${last}@theouthaven.com`);
  for (let i = 2; i <= 20 && last; i += 1) result.push(`${first}.${last}${i}@theouthaven.com`);
  return result;
}

async function requireAdmin(req: Request, supabaseUrl: string, anonKey: string, serviceRoleKey: string) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return { ok: false as const, status: 401, error: "Unauthorized" };
  const token = auth.slice(7);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return { ok: false as const, status: 401, error: "Unauthorized" };
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: adminUser } = await admin.from("admin_users").select("user_id,role,email,full_name").eq("user_id", userData.user.id).maybeSingle();
  if (!adminUser || !["superadmin", "admin"].includes(adminUser.role)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const, userId: userData.user.id, role: adminUser.role };
}

async function logEvent(db: any, input: Record<string, unknown>) {
  await db.from("career_employee_lifecycle_events").insert(input);
}

async function getM365Token() {
  const tenantId = Deno.env.get("M365_TENANT_ID");
  const clientId = Deno.env.get("M365_PROVISIONING_CLIENT_ID") || Deno.env.get("M365_CLIENT_ID");
  const clientSecret = Deno.env.get("M365_PROVISIONING_CLIENT_SECRET") || Deno.env.get("M365_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) return null;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Microsoft token request failed (${response.status}).`);
  const payload = await response.json();
  return clean(payload.access_token) || null;
}

async function graph(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Microsoft Graph failed (${response.status}).`);
  return payload;
}

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = Array.from(bytes).map((b) => (b % 36).toString(36)).join("");
  return `Toh!${token}A9`;
}

async function chooseCompanyEmail(db: any, firstName: string, lastName: string, requested?: string) {
  const requestedEmail = clean(requested).toLowerCase();
  const candidates = requestedEmail ? [requestedEmail] : emailCandidates(firstName, lastName);
  for (const candidate of candidates) {
    if (!candidate.endsWith("@theouthaven.com")) continue;
    const { data } = await db.from("career_team_conversions").select("id").ilike("company_email", candidate).maybeSingle();
    if (!data) return candidate;
  }
  throw new Error("No available company email could be generated automatically.");
}

async function createOrGetAuthUser(db: any, companyEmail: string, fullName: string, role: string) {
  const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = users.users.find((item: any) => String(item.email || "").toLowerCase() === companyEmail.toLowerCase());
  if (!user) {
    const created = await db.auth.admin.createUser({
      email: companyEmail,
      password: randomPassword(),
      email_confirm: true,
      user_metadata: { full_name: fullName },
      app_metadata: { employee_role: role },
    });
    if (created.error || !created.data.user) throw created.error || new Error("Could not create employee auth user.");
    user = created.data.user;
  }
  return user;
}

async function onboard(db: any, actorUserId: string, body: any) {
  const applicationId = clean(body.applicationId);
  if (!applicationId) throw new Error("applicationId is required.");

  const { data: application, error: appError } = await db
    .from("career_applications")
    .select("id,job_id,first_name,last_name,email,phone,stage,status,career_jobs(id,title,department,slug),career_offers(id,status,start_date,accepted_at)")
    .eq("id", applicationId)
    .maybeSingle();
  if (appError || !application) throw new Error("Candidate application was not found.");

  const offers = Array.isArray(application.career_offers) ? application.career_offers : [];
  const acceptedOffer = offers.find((offer: any) => offer.status === "accepted");
  if (application.stage !== "hired" && !acceptedOffer) {
    throw new Error("Only hired candidates or candidates with an accepted offer can be onboarded.");
  }

  const { data: profile } = await db
    .from("career_job_provisioning_profiles")
    .select("*")
    .eq("job_id", application.job_id)
    .eq("is_active", true)
    .maybeSingle();
  if (!profile) throw new Error("This job does not have an active provisioning profile.");
  if (!allowedRoles.has(profile.admin_role)) throw new Error("This role is not eligible for automatic provisioning.");

  const fullName = `${application.first_name} ${application.last_name}`.trim();
  const companyEmail = await chooseCompanyEmail(db, application.first_name, application.last_name, body.companyEmail);

  let { data: conversion } = await db.from("career_team_conversions").select("*").eq("application_id", application.id).maybeSingle();
  if (!conversion) {
    const inserted = await db.from("career_team_conversions").insert({
      application_id: application.id,
      team_role: profile.admin_role,
      admin_role: profile.admin_role,
      team_type: profile.team_type,
      department: profile.department || application.career_jobs?.department || null,
      manager_id: body.managerId || null,
      start_date: body.startDate || acceptedOffer?.start_date || null,
      permissions: profile.permissions || {},
      assigned_market_id: body.assignedMarketId || null,
      assigned_locations: Array.isArray(body.assignedLocations) ? body.assignedLocations : [],
      company_email: companyEmail,
      provisioning_status: "pending",
      converted_by: actorUserId,
      lifecycle_metadata: { personal_email: application.email, job_title: application.career_jobs?.title || null },
    }).select("*").single();
    if (inserted.error || !inserted.data) throw inserted.error || new Error("Could not create conversion record.");
    conversion = inserted.data;
  }

  await logEvent(db, { conversion_id: conversion.id, application_id: application.id, event_type: "onboarding", step: "started", status: "completed", actor_user_id: actorUserId });

  let microsoftUserId = conversion.microsoft_user_id || null;
  let microsoftStatus = "skipped";
  try {
    const token = await getM365Token();
    if (token) {
      let microsoftUser: any = null;
      try {
        microsoftUser = await graph(token, `/users/${encodeURIComponent(companyEmail)}`);
      } catch {
        microsoftUser = await graph(token, "/users", {
          method: "POST",
          body: JSON.stringify({
            accountEnabled: true,
            displayName: fullName,
            mailNickname: companyEmail.split("@")[0],
            userPrincipalName: companyEmail,
            usageLocation: "US",
            passwordProfile: { forceChangePasswordNextSignIn: true, password: randomPassword() },
          }),
        });
      }
      microsoftUserId = microsoftUser.id;
      const licenseSku = clean(profile.microsoft_license_sku_id || Deno.env.get("M365_EMPLOYEE_LICENSE_SKU_ID"));
      if (licenseSku) {
        await graph(token, `/users/${encodeURIComponent(microsoftUser.id)}/assignLicense`, {
          method: "POST",
          body: JSON.stringify({ addLicenses: [{ skuId: licenseSku }], removeLicenses: [] }),
        });
      }
      microsoftStatus = licenseSku ? "licensed" : "user_created_no_license";
      await logEvent(db, { conversion_id: conversion.id, application_id: application.id, event_type: "onboarding", step: "microsoft_365", status: "completed", actor_user_id: actorUserId, details: { microsoft_user_id: microsoftUserId, status: microsoftStatus } });
    } else {
      await logEvent(db, { conversion_id: conversion.id, application_id: application.id, event_type: "onboarding", step: "microsoft_365", status: "skipped", actor_user_id: actorUserId, details: { reason: "provisioning_credentials_not_configured" } });
    }
  } catch (error) {
    await logEvent(db, { conversion_id: conversion.id, application_id: application.id, event_type: "onboarding", step: "microsoft_365", status: "failed", actor_user_id: actorUserId, error: error instanceof Error ? error.message : String(error) });
    microsoftStatus = "failed";
  }

  const authUser = await createOrGetAuthUser(db, companyEmail, fullName, profile.admin_role);
  const userId = authUser.id;

  await db.from("users").upsert({ id: userId, email: companyEmail, full_name: fullName, phone: application.phone || null, role: profile.admin_role, disabled_at: null, disabled_by: null }, { onConflict: "id" });
  await db.from("admin_users").upsert({ user_id: userId, email: companyEmail, full_name: fullName, role: profile.admin_role }, { onConflict: "user_id" });

  if (profile.team_type) {
    await db.from("team_member_profiles").upsert({
      user_id: userId,
      team_type: profile.team_type,
      status: "active",
      pay_type: profile.pay_type || "unpaid",
      hourly_rate: profile.hourly_rate,
      include_in_payroll: Boolean(profile.include_in_payroll),
      can_clock_in: Boolean(profile.can_clock_in),
      can_track_work: Boolean(profile.can_track_work),
      can_do_site_visits: Boolean(profile.can_do_site_visits),
      can_do_social_outreach: Boolean(profile.can_do_social_outreach),
      can_work_support_tickets: Boolean(profile.can_work_support_tickets),
      can_send_claim_codes: Boolean(profile.can_send_claim_codes),
      can_send_owner_password_reset: Boolean(profile.can_send_owner_password_reset),
      can_use_demo_mode: profile.can_use_demo_mode !== false,
      allowed_work_types: profile.allowed_work_types || [],
      manager_id: body.managerId || conversion.manager_id || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  }

  await db.rpc("career_set_application_stage", { p_application_id: application.id, p_stage: "hired", p_changed_by: actorUserId, p_reason: "Employee onboarding provisioned" });

  const recovery = await db.auth.admin.generateLink({ type: "recovery", email: companyEmail });
  const activationUrl = recovery.data?.properties?.action_link || "https://www.theouthaven.com/login";
  const email = renderEnterpriseEmail({
    subject: "Welcome to TheOutHaven",
    preview: `Your TheOutHaven employee account is ready: ${companyEmail}`,
    heading: "Welcome to TheOutHaven",
    intro: `Hi ${application.first_name}, your employee account is ready.`,
    html: `<p><strong>Company email:</strong> ${companyEmail}</p><p><strong>Role:</strong> ${profile.admin_role}</p><p><strong>Department:</strong> ${profile.department || application.career_jobs?.department || "TheOutHaven"}</p><p>Use the secure setup button below to create your CRM password. For Microsoft 365, sign in with your new company email at Microsoft 365. You will be required to set or change your password and complete MFA.</p><p>If you need help, contact support@theouthaven.com.</p>`,
    ctaUrl: activationUrl,
    ctaLabel: "Set up your employee account",
  });
  const welcomeResult = await sendEmail({ to: application.email, subject: "Welcome to TheOutHaven", html: email.html, text: email.text, senderKey: "admin" });

  const now = new Date().toISOString();
  await db.from("career_team_conversions").update({
    user_id: userId,
    company_email: companyEmail,
    microsoft_user_id: microsoftUserId,
    provisioning_status: microsoftStatus === "failed" ? "partial_failure" : "completed",
    provisioned_at: now,
    welcome_sent_at: (welcomeResult as any).sent ? now : null,
    last_error: microsoftStatus === "failed" ? "Microsoft 365 provisioning failed; CRM account was created." : null,
  }).eq("id", conversion.id);

  await logEvent(db, { conversion_id: conversion.id, application_id: application.id, event_type: "onboarding", step: "crm_and_welcome", status: "completed", actor_user_id: actorUserId, details: { user_id: userId, company_email: companyEmail, welcome_sent: Boolean((welcomeResult as any).sent) } });

  return { success: true, conversionId: conversion.id, companyEmail, userId, microsoftUserId, microsoftStatus, welcomeEmailSent: Boolean((welcomeResult as any).sent) };
}

async function offboard(db: any, actorUserId: string, body: any) {
  const conversionId = clean(body.conversionId);
  if (!conversionId) throw new Error("conversionId is required.");
  const { data: conversion } = await db.from("career_team_conversions").select("*").eq("id", conversionId).maybeSingle();
  if (!conversion) throw new Error("Employee conversion was not found.");
  if (conversion.offboarding_status === "completed") return { success: true, alreadyCompleted: true, conversionId };

  await db.from("career_team_conversions").update({ offboarding_status: "in_progress", last_error: null }).eq("id", conversionId);
  await logEvent(db, { conversion_id: conversionId, application_id: conversion.application_id, event_type: "offboarding", step: "started", status: "completed", actor_user_id: actorUserId, details: { reason: body.reason || null } });

  const userId = conversion.user_id;
  if (userId) {
    await db.from("team_member_profiles").update({ status: "inactive", can_clock_in: false, can_track_work: false, can_do_site_visits: false, can_do_social_outreach: false, can_work_support_tickets: false, can_send_claim_codes: false, can_send_owner_password_reset: false, updated_at: new Date().toISOString() }).eq("user_id", userId);
    await db.from("admin_users").update({ role: "disabled" }).eq("user_id", userId);
    await db.from("users").update({ disabled_at: new Date().toISOString(), disabled_by: actorUserId }).eq("id", userId);
    const authUpdate = await db.auth.admin.updateUserById(userId, { ban_duration: "876000h", app_metadata: { employee_status: "offboarded" } });
    if (authUpdate.error) throw authUpdate.error;
  }

  let microsoftStatus = "skipped";
  try {
    const token = await getM365Token();
    if (token && conversion.microsoft_user_id) {
      await graph(token, `/users/${encodeURIComponent(conversion.microsoft_user_id)}`, { method: "PATCH", body: JSON.stringify({ accountEnabled: false }) });
      microsoftStatus = "disabled";
      await logEvent(db, { conversion_id: conversionId, application_id: conversion.application_id, event_type: "offboarding", step: "microsoft_365", status: "completed", actor_user_id: actorUserId, details: { status: microsoftStatus } });
    } else {
      await logEvent(db, { conversion_id: conversionId, application_id: conversion.application_id, event_type: "offboarding", step: "microsoft_365", status: "skipped", actor_user_id: actorUserId, details: { reason: "no_microsoft_user_or_credentials" } });
    }
  } catch (error) {
    microsoftStatus = "failed";
    await logEvent(db, { conversion_id: conversionId, application_id: conversion.application_id, event_type: "offboarding", step: "microsoft_365", status: "failed", actor_user_id: actorUserId, error: error instanceof Error ? error.message : String(error) });
  }

  const now = new Date().toISOString();
  await db.from("career_team_conversions").update({
    offboarding_status: microsoftStatus === "failed" ? "partial_failure" : "completed",
    offboarded_at: now,
    offboarded_by: actorUserId,
    last_error: microsoftStatus === "failed" ? "Microsoft 365 account could not be disabled; TheOutHaven access was revoked." : null,
  }).eq("id", conversionId);

  await logEvent(db, { conversion_id: conversionId, application_id: conversion.application_id, event_type: "offboarding", step: "crm_access_revoked", status: "completed", actor_user_id: actorUserId, details: { user_id: userId, microsoft_status: microsoftStatus } });
  return { success: true, conversionId, userId, microsoftStatus };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ success: false, error: "Supabase is not configured." }, 500);

  const admin = await requireAdmin(req, supabaseUrl, anonKey, serviceRoleKey);
  if (!admin.ok) return json({ success: false, error: admin.error }, admin.status);
  const db = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json().catch(() => ({}));
    const action = clean(body.action);
    const result = action === "onboard"
      ? await onboard(db, admin.userId, body)
      : action === "offboard"
        ? await offboard(db, admin.userId, body)
        : (() => { throw new Error("Unsupported career workflow action."); })();
    return json(result);
  } catch (error) {
    console.error("career-workflow failed", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Career workflow failed." }, 400);
  }
});
