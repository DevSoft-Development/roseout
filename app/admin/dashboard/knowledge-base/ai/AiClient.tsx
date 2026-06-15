"use client";

import Link from "next/link";
import { useState } from "react";
import { Sparkles } from "lucide-react";

type Msg = { q: string; a: string; sources: { id: string; title: string; slug: string; excerpt: string | null }[] };

const prompts = [
  "When is a $75 Ambassador commission earned?",
  "What should Ambassadors never promise?",
  "How do I explain TheOutHaven Partner Plan — $99/month?",
  "What do I do if a QR claim code is wrong?",
  "When should the Experience Team escalate a support issue?",
  "Why should locations without photos not show in live results?",
];

export default function AiClient() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Msg[]>([]);

  async function ask(q = question) {
    if (!q.trim()) return;
    setLoading(true);
    const res = await fetch("/api/admin/knowledge-base/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      alert(data.error);
      return;
    }
    setHistory([{ q, a: data.answer, sources: data.sources || [] }, ...history]);
    setQuestion("");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-[#e1062a]/30 bg-[#e1062a]/10 p-6 shadow-[0_18px_50px_rgba(225,6,42,0.16)]">
        <Sparkles className="mb-3 h-8 w-8 text-red-400" />
        <h1 className="text-4xl font-black">Knowledge Base AI Assistant</h1>
        <p className="mt-3 text-rose-100/70">Answers are limited to approved internal knowledge base articles.</p>
      </section>
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask an approved KB question…" className="min-h-28 w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-white outline-none focus:border-[#e1062a]/50" />
        <button disabled={loading} onClick={() => ask()} className="mt-3 rounded-full bg-[#e1062a] px-6 py-3 font-black text-white shadow-[0_18px_50px_rgba(225,6,42,0.22)] disabled:opacity-60">{loading ? "Searching approved sources…" : "Ask"}</button>
      </div>
      <div className="flex flex-wrap gap-2">{prompts.map((prompt) => <button key={prompt} onClick={() => ask(prompt)} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-rose-100/80 transition hover:border-[#e1062a]/30 hover:bg-[#e1062a]/10">{prompt}</button>)}</div>
      <div className="space-y-4">
        {history.map((message, index) => (
          <article key={index} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="font-black text-rose-100">Q: {message.q}</p>
            <p className="mt-4 whitespace-pre-wrap text-rose-50/90">{message.a}</p>
            <div className="mt-5 grid gap-2 md:grid-cols-2">
              {message.sources.map((source) => <Link key={source.id} href={`/admin/dashboard/knowledge-base/${source.slug}`} className="rounded-2xl border border-white/10 p-3 transition hover:border-[#e1062a]/30 hover:bg-[#e1062a]/10"><b>{source.title}</b><p className="text-sm text-rose-100/60">{source.excerpt}</p></Link>)}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
