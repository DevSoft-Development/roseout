import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { authorizeSearchLearning } from "../search-learning-auth";
import { buildSuggestedIntentFromOutcomes, detectVagueLanguageSignals, getPhraseKey, normalizeSearchPhrase, scorePhraseLearningCandidate } from "@/lib/ml/searchPhraseLearning";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 300;
function num(v:any){return Number(v||0)||0} function arr(v:any){return Array.isArray(v)?v:[]}
export async function POST(req: NextRequest) {
  const auth = await authorizeSearchLearning(req); if (auth.error) return auth.error;
  const body = await req.json().catch(()=>({})); const daysBack = Math.min(365, Math.max(1, num(body.daysBack)||30)); const minQueryCount = Math.max(1, num(body.minQueryCount)||3); const dryRun = body.dryRun === true; const limit = Math.min(5000, Math.max(1, num(body.limit)||500));
  const run = await supabaseAdmin.from("search_phrase_learning_runs").insert({ run_type: dryRun ? "dry_run" : "manual", status: "running", metadata: { daysBack, minQueryCount, limit } }).select("id").maybeSingle();
  const runId = run.data?.id; const errors:string[] = [];
  const since = new Date(Date.now() - daysBack * 864e5).toISOString();
  const { data: events, error } = await supabaseAdmin.from("search_events").select("raw_query,normalized_query,result_count,success,had_issue,issue_type,metadata,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(limit);
  if (error) errors.push(`search_events: ${error.message}`);
  const groups = new Map<string, any>();
  for (const e of events || []) {
    const raw = e.raw_query || e.normalized_query; if (!raw) continue; const signals = detectVagueLanguageSignals(raw); if (!signals.length) continue;
    const key = getPhraseKey(raw); const g = groups.get(key) || { phrase_key:key, display_phrase: normalizeSearchPhrase(raw), example_queries:[], query_count:0, click_count:0, save_count:0, completion_count:0, bounce_count:0, negative_outcome_count:0, successful_outcome_count:0, result_total:0 };
    g.query_count++; if (g.example_queries.length < 8 && !g.example_queries.includes(raw)) g.example_queries.push(raw); g.result_total += num(e.result_count);
    const md = e.metadata || {}; const clicks = num(md.click_count ?? md.clicks ?? md.clickedResults); const saves = num(md.save_count ?? md.saves); const completions = num(md.completion_count ?? md.completed_outings);
    g.click_count += clicks; g.save_count += saves; g.completion_count += completions;
    const noResults = num(e.result_count) === 0 || e.success === false || e.had_issue === true; if (noResults) g.bounce_count++;
    if (noResults || /bad|negative|no_results/i.test(String(e.issue_type||""))) g.negative_outcome_count++;
    if (clicks || saves || completions || (e.success !== false && num(e.result_count)>0)) g.successful_outcome_count++;
    groups.set(key,g);
  }
  let created=0, updated=0; const candidates = [...groups.values()].filter(g=>g.query_count>=minQueryCount).map(g=>{ const support=scorePhraseLearningCandidate(g); const confidence = Math.min(100, Number((support / Math.max(1, g.query_count) * 10).toFixed(2))); const suggested_intent = buildSuggestedIntentFromOutcomes({ phrase:g.display_phrase, phraseKey:g.phrase_key, exampleQueries:g.example_queries, clicks:g.click_count, saves:g.save_count, completions:g.completion_count, bounces:g.bounce_count }); return { ...g, support_score:support, confidence_score:confidence, suggested_intent, suggested_activity_types:suggested_intent.activityTypes||[], suggested_cuisines:suggested_intent.cuisines||[], suggested_vibes:suggested_intent.vibes||[], suggested_occasions:suggested_intent.occasions||[], suggested_exclusions:suggested_intent.exclusions||[], updated_at:new Date().toISOString() }; });
  if (!dryRun) for (const c of candidates) { const existing = await supabaseAdmin.from("search_phrase_learning_suggestions").select("id,status").eq("phrase_key", c.phrase_key).maybeSingle(); if (existing.data?.id) { await supabaseAdmin.from("search_phrase_learning_suggestions").update(c).eq("id", existing.data.id); updated++; } else { await supabaseAdmin.from("search_phrase_learning_suggestions").insert(c); created++; } }
  if (runId) await supabaseAdmin.from("search_phrase_learning_runs").update({ completed_at:new Date().toISOString(), status: errors.length ? "completed_with_warnings" : "completed", queries_scanned:(events||[]).length, phrases_grouped:groups.size, suggestions_created:created, suggestions_updated:updated, errors, metadata:{ daysBack,minQueryCount,limit,dryRun,candidate_count:candidates.length } }).eq("id",runId);
  return Response.json({ success:true, message: dryRun ? "Search Learning dry run completed." : "Search Learning completed. Suggestions are pending admin review.", queriesScanned:(events||[]).length, phrasesGrouped:groups.size, suggestionsCreated:created, suggestionsUpdated:updated, candidateCount:candidates.length, errors });
}
