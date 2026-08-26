import type { HealthIssue, SearchEvent } from "@/lib/admin/search-health-dashboard";

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function intelligence(issue: HealthIssue) {
  const debug = asRecord(issue.debug);
  const normalized = asRecord(debug.normalizedIntent ?? debug.parsedIntent);
  const language = asRecord(debug.nlp ?? normalized.language);
  const learned = asRecord(debug.learnedLanguage ?? normalized.learnedLanguage);
  const semantic = asRecord(debug.phase13ProductionIntegration ?? normalized.semantic);
  return { debug, normalized, language, learned, semantic };
}

function searchIntelligence(search: SearchEvent) {
  const metadata = asRecord(search.metadata);
  const normalized = asRecord(metadata.normalizedIntent);
  const language = asRecord(normalized.language);
  const learned = asRecord(normalized.learnedLanguage);
  const semantic = asRecord(normalized.semantic);
  return { normalized, language, learned, semantic };
}

function failureCategory(issue: HealthIssue) {
  const { debug, normalized } = intelligence(issue);
  return String(
    debug.failureCategory ??
      normalized.failureCategory ??
      debug.requiredPairingFailureReason ??
      issue.event_type ??
      "UNCLASSIFIED",
  ).toUpperCase();
}

function parserSource(issue: HealthIssue) {
  const { debug, normalized, language, learned } = intelligence(issue);
  if (learned.used === true) return "Learned mapping";
  if (language.llmUsed === true) return "Hybrid / LLM";
  return String(normalized.intentParserSource ?? debug.intentParserSource ?? "Deterministic");
}

function relationship(issue: HealthIssue) {
  const { debug, normalized, language } = intelligence(issue);
  return String(
    language.relationship?.type ??
      normalized.relationship?.type ??
      debug.searchPlan?.relationship?.type ??
      "—",
  );
}

function countBy<T>(rows: T[], getKey: (row: T) => string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = getKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export default function SearchDiagnosticsPanel({ rows, searches = [] }: { rows: HealthIssue[]; searches?: SearchEvent[] }) {
  const failures = countBy(rows, failureCategory).slice(0, 6);
  const parsers = countBy(rows, parserSource);

  const issueLlmAssisted = rows.filter((row) => intelligence(row).language.llmUsed === true).length;
  const searchLlmAssisted = searches.filter((row) => searchIntelligence(row).language.llmUsed === true).length;
  const llmAssisted = Math.max(issueLlmAssisted, searchLlmAssisted);

  const learnedReuse = searches.filter((row) => searchIntelligence(row).learned.used === true).length ||
    rows.filter((row) => intelligence(row).learned.used === true).length;

  const semanticAssisted = searches.filter((row) => {
    const semantic = searchIntelligence(row).semantic;
    return semantic.semanticEnabled === true ||
      Number(semantic.restaurant?.semanticCandidates ?? 0) > 0 ||
      Number(semantic.activity?.semanticCandidates ?? 0) > 0;
  }).length || rows.filter((row) => {
    const semantic = intelligence(row).semantic;
    return semantic.semanticEnabled === true ||
      Number(semantic.restaurant?.semanticCandidates ?? 0) > 0 ||
      Number(semantic.activity?.semanticCandidates ?? 0) > 0;
  }).length;

  const refinements = searches.filter((row) => asRecord(searchIntelligence(row).normalized.conversationRefinement).used === true).length ||
    rows.filter((row) => asRecord(intelligence(row).normalized.conversationRefinement).used === true).length;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          ["Open issues", rows.length],
          ["LLM assisted", llmAssisted],
          ["LLM avoided", learnedReuse],
          ["Semantic assisted", semanticAssisted],
          ["Refinements", refinements],
          ["Failure categories", failures.length],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-white/10 bg-[#100d0c] p-4 shadow-[0_18px_50px_rgba(0,0,0,.18)]">
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-white/40">{label}</p>
            <p className="mt-2 text-2xl font-black tracking-tight text-white">{value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <section className="rounded-2xl border border-white/10 bg-[#100d0c] p-5">
          <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[.2em] text-rose-300">Failure intelligence</p>
              <h2 className="mt-1 text-xl font-black">What is breaking search</h2>
            </div>
            <span className="text-xs font-bold text-white/35">Current filtered window</span>
          </div>
          <div className="mt-4 space-y-2">
            {failures.length ? failures.map(([name, count]) => (
              <div key={name} className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-black/20 px-4 py-3">
                <div>
                  <p className="text-sm font-black text-white">{name.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-xs text-white/40">Open an issue below for its interpretation, exclusions, relationship, candidate losses, and fallback trace.</p>
                </div>
                <span className="rounded-full border border-rose-400/20 bg-rose-950/30 px-3 py-1 text-sm font-black text-rose-100">{count}</span>
              </div>
            )) : <p className="py-8 text-center text-sm text-white/40">No classified failures in this window.</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#100d0c] p-5">
          <p className="text-xs font-black uppercase tracking-[.2em] text-rose-300">Understanding layer</p>
          <h2 className="mt-1 text-xl font-black">How queries were interpreted</h2>
          <div className="mt-4 space-y-3">
            {parsers.length ? parsers.map(([name, count]) => (
              <div key={name} className="flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-4 py-3">
                <span className="text-sm font-bold text-white/70">{name}</span>
                <span className="text-sm font-black text-white">{count}</span>
              </div>
            )) : <p className="py-6 text-center text-sm text-white/40">No parser diagnostics in this window yet.</p>}
          </div>
          <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-4">
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-white/35">Relationship mix</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {countBy(rows, relationship).slice(0, 8).map(([name, count]) => (
                <span key={name} className="rounded-full border border-white/10 bg-white/[.03] px-3 py-1.5 text-xs font-bold text-white/60">
                  {name.replaceAll("_", " ")} · {count}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
