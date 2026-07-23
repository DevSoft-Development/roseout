import Link from "next/link";
import SearchLimitsClient from "./SearchLimitsClient";
import SearchMaintenanceClient from "./SearchMaintenanceClient";
import AiTagHelperSettingsClient from "./AiTagHelperSettingsClient";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_SEARCH_LIMITS } from "@/lib/search-usage-limits