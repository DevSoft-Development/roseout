import type { EnterpriseLocation, EnterprisePair, EnterpriseSearchResult } from "@/lib/search/enterprise/types";
import { evaluateCandidateEligibility } from "@/lib/search/enterprise/classification";
import { fuseSearchCandidates } from "@/lib/search/enterprise/semantic";
import { calculateBehavioralAdjustments, stablePairKey } from "@/lib/ml/behavioralFeatures";
import { supabaseAdmin } from "@/lib/supabase-admin";

const enabled = (name: string, fallback = false) => {
  const value = process