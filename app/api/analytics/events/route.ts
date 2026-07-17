import { NextResponse } from "next/server";

import { trackEvent, isUuid } from "@/lib/analytics/trackEvent";
import { buildAnalyticsFeedbackEvent } from "@/lib/ml/buildAnalyticsFeedbackEvent";
import { classifySearchIntent } from "@/lib/ml/intentBuckets";
import { createClient } from "@/lib/supabase-server";

const MAX_BODY = 16_384;
const privateKey = /email|phone_number|password|card|token|secret|notes?/i;

function string(value: unknown, max = 256) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function number(value: unknown, min = -