import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 100;
const MAX_BULK_SIZE = 250;
const SELECT = "id,name,restaurant_name,activity_name,address,city,state,location_type,status,data_status,quality_status,