import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildAnalyticsFeedbackEvent } from "@/lib/ml/buildAnalyticsFeedbackEvent";

type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

export type TrackEventInput = {
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
  source?: string |