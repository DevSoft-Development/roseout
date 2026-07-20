import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  BUSINESS_ANALYTICS_EVENT_TYPES,
  trackLocationAnalyticsEvent,
  type BusinessAnalyticsEventType,
} from "@/lib/analytics/business-analytics";

const MAX_METADATA_BYTES = 8_000;
const MAX_TEXT_LENGTH =