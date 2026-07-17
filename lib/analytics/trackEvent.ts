import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildAnalyticsFeedbackEvent } from "@/lib/ml/buildAnalyticsFeedbackEvent";

type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

type TrackEventInput = {
  event_name?: string | null;
  event_type?: string | null;
  user_id?: string | null;
  anonymous_id?: string | null;
  session_id?: string | null;
  outing_id?: string | null;
  location_id?: string | null;
  source_location_id?: string | null;
  owner_id?: string | null;
  query?: string | null;
  normalized_query?: string | null;
  search_intent?: Record<string, JsonValue> | null;
  page_path?: string | null;
  referrer?: string | null;
  source?: string | null;
  device_type?: string | null;
  browser?: string | null;
  os?: string | null;
  city?: string | null;
  borough?: string | null;
  neighborhood?: string | null;
  location_type?: string | null;
  category?: string | null;
  cuisine?: string | null;
  activity_type?: string | null;
  ranking_position?: number | null;
  result_count?: number | null;
  response_time_ms?: