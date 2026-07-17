import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getPhotoPublishabilityUpdates } from "@/lib/location-growth/repairPhotoPublishability";
import {
  ACTIVE_MARKET_STATES,
  buildPublishabilityUpdate,
  evaluateLocationPublishability,
  type LocationPublishabilityInput,
} from "@/lib/location-publishability";
import { supabaseAdmin } from "@/lib/supabase-admin";

export