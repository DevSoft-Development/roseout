import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { runOutingSearch } from "@/lib/search/runSearch";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Scenario = {
  id: string;
  scenario_key: string;
  prompt: string;
  expected_result_type: string | null;
  expected_market: string | null;
  expected_min_results: number;
  metadata: Record<string, unknown> | null;
};

type CollectedResult = {
  item: