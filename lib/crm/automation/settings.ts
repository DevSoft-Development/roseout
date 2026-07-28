import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AutomationSettings } from "./types";
export async function loadAutomationSettings():Promise<AutomationSettings>{const {data,error}=await supabaseAdmin.from("crm_automation_settings").select("*").eq("singleton",true).single();if(error)throw error;return{automationEnabled:data.automation_enabled&&process.env.CRM_AUTOMATION_ENABLED!=="false",emailAutomationEnabled:data.email_automation_enabled,taskAutomationEnabled:data.task_automation_enabled,batchSize:Number(process.env.CRM_SEQUENCE_BATCH_SIZE??data.batch_size),leaseSeconds:Number(process.env.CRM_SEQUENCE_LEASE_SECONDS??data.lease_seconds),maxAttempts:data.max_attempts,dailyLimit:data.contact_daily_email_limit,weeklyLimit:data.contact_weekly_email_limit,quietHoursEnabled:data.quiet_hours_enabled,defaultTimezone:data.default_timezone,emergencyStopReason:data.emergency_stop_reason}}

