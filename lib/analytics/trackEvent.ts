import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildAnalyticsFeedbackEvent } from "@/lib/ml/buildAnalyticsFeedbackEvent";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

type JsonRecord = Record<string, JsonValue>;

export type TrackEventInput