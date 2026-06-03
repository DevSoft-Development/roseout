"use client";

import { useMemo, useState } from "react";
import { labelize } from "@/lib/team-tools-client";

type Session = { id: string; work_type: string; clock_in_at: string; total_minutes?: number | null; status: string; approval_status?: string | null };

type Props = { profile: any; allowedWorkTypes: string[]; activeSession: Session | null; recentSessions: Session[] };

export default function TeamWorkSessionClient({ profile, allowedWorkTypes, activeSession: initialActive, recentSessions }: Props) {
  const [activeSession, setActiveSession] = useState<Session | null>(initialActive);
  const [workType, setWorkType] = useState(allowedWorkTypes[0] || "");
  const [userNotes, setUserNotes] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const deviceName = useMemo(() => (typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : ""), []);

  async function submit(action: "start" | "stop") {
    setLoading(true); setMessage("");
    try {
      const res = await fetch("/api/team/work-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, workType, sessionId: activeSession?.id, userNotes, deviceName }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update work session.");
      setActiveSession(action === "start" ? data.session : null);
      setUserNotes("");
      setMessage(action === "start" ? "Clocked in. No GPS/location was requested." : "Clocked out and submitted for review.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update work session."); }
    finally { setLoading(false); }
  }

  return <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
    <section className="rounded-[2rem] border border-white/10 bg-[#111] p-5 shadow-2xl sm:p-7">
      <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">My Work Session</p>
      <h1 className="mt-2 text-3xl font-black">Clock in / clock out</h1>
      <p className="mt-3 text-sm font-bold leading-6 text-white/55">Clock-in/out is time tracking only. The browser will not ask for GPS, latitude/longitude, or a nearby address here.</p>
      <div className="mt-5 rounded-3xl border border-white/10 bg-black/35 p-4">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Team profile</p>
        <p className="mt-2 text-lg font-black">{labelize(profile.team_type)} · {labelize(profile.status)}</p>
        {allowedWorkTypes.length === 0 ? <p className="mt-2 text-sm font-bold text-red-200">No work types are enabled for this profile.</p> : null}
      </div>
      {activeSession ? <div className="mt-5 rounded-3xl border border-emerald-400/25 bg-emerald-500/10 p-5">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-100">Active session</p>
        <h2 className="mt-2 text-2xl font-black">{labelize(activeSession.work_type)}</h2>
        <p className="mt-1 text-sm font-bold text-emerald-100/75">Started {new Date(activeSession.clock_in_at).toLocaleString()}</p>
        <textarea value={userNotes} onChange={(e) => setUserNotes(e.target.value)} rows={3} className="mt-4 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none" placeholder="Optional clock-out notes" />
        <button disabled={loading} onClick={() => submit("stop")} className="mt-4 rounded-full bg-white px-6 py-3 text-sm font-black text-black disabled:opacity-50">{loading ? "Saving..." : "Clock Out"}</button>
      </div> : <div className="mt-5 space-y-4">
        <label className="block text-sm font-bold text-white/65"><span>Work type</span><select value={workType} onChange={(e) => setWorkType(e.target.value)} className="mt-2 w-full rounded-full border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none">{allowedWorkTypes.map((type) => <option key={type} value={type}>{labelize(type)}</option>)}</select></label>
        <textarea value={userNotes} onChange={(e) => setUserNotes(e.target.value)} rows={3} className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none" placeholder="Optional notes" />
        <button disabled={loading || !workType} onClick={() => submit("start")} className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white disabled:opacity-50">{loading ? "Saving..." : "Clock In"}</button>
      </div>}
      {message ? <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-sm font-bold text-white/75">{message}</p> : null}
    </section>
    <aside className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 sm:p-7">
      <p className="text-xs font-black uppercase tracking-[0.28em] text-white/40">Recent sessions</p>
      <div className="mt-4 space-y-3">{recentSessions.map((session) => <div key={session.id} className="rounded-2xl border border-white/10 bg-black/30 p-4"><p className="font-black">{labelize(session.work_type)}</p><p className="mt-1 text-xs font-bold text-white/45">{new Date(session.clock_in_at).toLocaleString()} · {labelize(session.status)} · {labelize(session.approval_status || "pending_review")}</p></div>)}{recentSessions.length === 0 ? <p className="text-sm font-bold text-white/45">No sessions yet.</p> : null}</div>
    </aside>
  </div>;
}
