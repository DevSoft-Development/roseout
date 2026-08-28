"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/admin-access";
import { clearSearchMlRuntimeConfigCache, type HfSearchMode } from "@/lib/search/huggingFaceEmbedding";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MODE_COLUMNS = {
  semantic: "semantic_mode",
  reranking: "rerank_mode",
  intent: "intent_mode",
  query_memory: "query_memory_mode",
  learning: "learning_mode",
  menu: "menu_mode",
  location_tags: "location_tag_mode",
  photo_intelligence: "photo_intelligence_mode",
  personalization: "personalization_mode",
} as const;

type ModeKey = keyof typeof MODE_COLUMNS;

function validMode(value: string): value is HfSearchMode {
  return value === "disabled" || value === "shadow" || value === "enabled";
}

export async function updateSearchMlMode(formData: FormData) {
  await requireAdmin();

  const key = String(formData.get("key") ?? "") as ModeKey;
  const mode = String(formData.get("mode") ?? "");
  const column = MODE_COLUMNS[key];
  if (!column || !validMode(mode)) throw new Error("Invalid ML runtime mode update.");

  const { error } = await supabaseAdmin
    .from("search_ml_runtime_config")
    .update({ [column]: mode, updated_at: new Date().toISOString() })
    .eq("singleton", true);
  if (error) throw new Error(`Unable to update ${key}: ${error.message}`);

  clearSearchMlRuntimeConfigCache();
  revalidatePath("/admin/dashboard/search-health/ml");
}
