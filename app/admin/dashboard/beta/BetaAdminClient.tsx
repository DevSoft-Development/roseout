"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { betaSuggestedPromptCategories } from "@/lib/betaSuggestedPrompts";
const tabs = [
  "Weekly Program",
  "Overview",
  "Applications",
  "Testers",
  "Tasks",
  "Feedback",
  "Bugs",
  "Search Speed",
  "Custom Prompts",
  "Reminders",
  "Turnstile",
  "Settings",
];
function Badge({
  children,
  tone = "neutral",
}: {
  children: any;
  tone?: string;
}) {
  const c =
    tone === "danger"
      ? "bg-red-500/15 text-red-200 border-red-300/20"
      : tone === "positive"
        ? "bg-emerald-500/15 text-emerald-200 border-emerald-300/20"
        : tone === "warning"
          ? "bg-orange-500/15 text-orange-100 border-orange-300/20"
          : tone === "info"
            ? "bg-sky-500/15 text-sky-100 border-sky-300/20"
            : "bg-white/10 text-white/70 border-white/10";
  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-black ${c}`}>
      {children}
    </span>
  );
}
function tone(v: string) {
  return ["fixed", "fast", "active", "approved", "sent", "true"].includes(
    String(v),
  )
    ? "positive"
    : ["critical", "failed", "timeout", "high"].includes(String(v))
      ? "danger"
      : ["slow", "medium", "reviewing", "pending"].includes(String(v))
        ? "warning"
        : "neutral";
}
export default function BetaAdminClient({
  overview,
  applications,
  testers,
  tasks,
  feedback,
  bugs,
  searchLogs,
  customPrompts,
  reminders,
  turnstile,
  weeklySettings,
  weeklySessions,
}: {
  overview: any;
  applications: any[];
  testers: any[];
  tasks: any[];
  feedback: any[];
  bugs: any[];
  searchLogs: any[];
  customPrompts: any;
  reminders: any[];
  turnstile: any;
  weeklySettings: any;
  weeklySessions: any[];
}) {
  const [tab, setTab] = useState("Weekly Program");
  const [taskStatusFilter, setTaskStatusFilter] = useState<"active" | "draft">("active");
  const filteredTasks = useMemo(
    () => tasks.filter((task) => String(task.status || "active") === taskStatusFilter),
    [tasks, taskStatusFilter],
  );
  const promptInsightCards = [
    [
      "Group night prompts",
      betaSuggestedPromptCategories.find(
        (category) => category.id === "group_night",
      )?.prompts.length ?? 0,
    ],
    ["Group dinner + drinks", "group dinner and drinks"],
    [
      "Social outing prompts",
      betaSuggestedPromptCategories
        .filter((category) => category.id === "group_night")
        .flatMap((category) => category.prompts).length,
    ],
  ];
  const cards = useMemo(
    () => [
      ["Total applications", overview.total_applications],
      ["New applications", overview.new_applications],
      ["Active testers", overview.active_testers],
      ["Open feedback", overview.open_feedback],
      ["Open bugs", overview.open_bugs],
      ["Critical bugs", overview.critical_bugs],
      [
        "Avg search speed 24h",
        overview.avg_search_ms_24h
          ? `${Math.round(overview.avg_search_ms_24h)}ms`
          : "—",
      ],
      ["Slow searches 24h", overview.slow_searches_24h],
      ["Failed searches 24h", overview.failed_searches_24h],
      ["Search count 24h", overview.search_count_24h],
      ["Custom prompt searches 24h", overview.custom_prompt_searches_24h],
      ["Turnstile failures 24h", overview.turnstile_failures_24h],
      ["Testers completed 5/5", overview.testers_completed_5_of_5],
      ["Reminder emails sent", overview.reminder_emails_sent_week],
      ["Reminder emails failed", overview.reminder_emails_failed_week],
    ],
    [overview],
  );
  async function post(url: string, payload: any = {}) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    alert(data.message || (res.ok ? "Done." : "Request failed."));
    location.reload();
  }
  async function patch(url: string, payload: any) {
    await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    location.reload();
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-xs font-black ${tab === t ? "bg-rose-600 text-white" : "border border-white/10 bg-black/20 text-white/60"}`}
          >
            {t}
          </button>
        ))}
        <Link
          href="/admin/dashboard/search-health"
          className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-black text-white/70"
        >
          Search Health
        </Link>
      </div>

      {tab === "Weekly Program" && (
        <div className="space-y-4">
          <section className="rounded-3xl border border-white/10 bg-white/[.04] p-5">
            <p className="text-xs font-black uppercase tracking-[.28em] text-rose-200">Weekly Beta Program</p>
            <h2 className="mt-2 text-3xl font-black">Weekly Beta Program</h2>
            <p className="mt-2 text-sm text-white/60">Each tester completes one guided beta session per week with 5 tracked steps.</p>
          </section>
          <section className="grid gap-3 md:grid-cols-2">
            <ControlCard title="Run real weekly beta task" description="When this is on, active beta testers can receive and complete the real weekly 5-step beta task." enabled={Boolean(weeklySettings.weekly_beta_enabled)} onToggle={() => patch("/api/admin/beta/weekly-settings", { weekly_beta_enabled: !weeklySettings.weekly_beta_enabled })} actions={<button onClick={() => post("/api/admin/beta/weekly-sessions")} className="rounded-full bg-rose-600 px-4 py-2 text-xs font-black">Create Real Weekly Sessions</button>} />
            <ControlCard title="End-to-end weekly beta test mode" description="Run the full weekly beta flow, including emails, reminders, search, feedback, and admin review, without counting anything toward real beta progress, giveaway eligibility, prize entries, or real analytics." enabled={Boolean(weeklySettings.weekly_beta_e2e_test_mode_enabled)} onToggle={() => patch("/api/admin/beta/weekly-settings", { weekly_beta_e2e_test_mode_enabled: !weeklySettings.weekly_beta_e2e_test_mode_enabled })} actions={<div className="flex flex-wrap gap-2"><button onClick={() => post("/api/admin/beta/test-weekly-session", { action: "create" })} className="rounded-full bg-rose-600 px-4 py-2 text-xs font-black">Create Test Weekly Session</button></div>} />
          </section>
          <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Active Beta Testers" value={overview.active_testers ?? 0} />
            <Stat label="Weekly Sessions Started" value={weeklySessions.filter((s) => !s.test_mode && s.status !== "not_started").length} />
            <Stat label="Weekly Sessions Completed" value={weeklySessions.filter((s) => !s.test_mode && s.status === "completed").length} />
            <Stat label="Average Steps Completed" value={averageSteps(weeklySessions.filter((s) => !s.test_mode))} />
            <Stat label="Needs Reminder" value={weeklySessions.filter((s) => !s.test_mode && s.status !== "completed").length} />
            <Stat label="Test Sessions" value={weeklySessions.filter((s) => s.test_mode).length} />
          </section>
          <Table
            rows={weeklySessions}
            cols={["tester", "week", "mode", "status", "steps_completed", "outing_sentence", "result_mode", "selected_result", "last_activity"]}
            emptyMessage="No weekly beta sessions yet. Turn on the weekly beta task or run a test session to make sure everything is working."
            actions={(r: any) => (
              <>
                <Link href={`/admin/dashboard/beta?session=${r.id}`} className="text-rose-200">View details</Link>
                <button onClick={() => r.test_mode ? post("/api/admin/beta/test-weekly-session", { action: "send_reminder", session_id: r.id }) : post("/api/admin/beta/reminders", { reminderType: "midweek_reminder" })} className="text-sky-200">Send reminder</button>
                <button className="text-emerald-200">Mark reviewed</button>
                {r.test_mode && <button onClick={() => confirm("Reset this test weekly task? This only clears test-mode progress and does not affect real beta testers.") && post("/api/admin/beta/test-weekly-session", { action: "reset", session_id: r.id })} className="text-orange-200">Reset test session</button>}
                {r.test_mode && <button onClick={() => confirm("Delete this test session? This only removes test-mode records.") && post("/api/admin/beta/test-weekly-session", { action: "delete", session_id: r.id })} className="text-red-200">Delete test session</button>}
              </>
            )}
          />
        </div>
      )}
      {tab === "Overview" && (
        <>
          <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
            {cards.map(([k, v]) => (
              <div
                key={k}
                className="rounded-2xl border border-white/10 bg-white/[.04] p-4"
              >
                <p className="text-xs text-white/55">{k}</p>
                <p className="mt-1 text-2xl font-black">{v ?? 0}</p>
              </div>
            ))}
          </section>
          <section className="grid gap-3 md:grid-cols-3">
            {promptInsightCards.map(([k, v]) => (
              <div
                key={k}
                className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4"
              >
                <p className="text-xs text-rose-100/70">{k}</p>
                <p className="mt-1 text-xl font-black text-white">{v}</p>
              </div>
            ))}
          </section>
        </>
      )}
      {tab === "Applications" && (
        <Table
          rows={applications}
          cols={[
            "created_at",
            "name",
            "email",
            "tester_type",
            "status",
            "turnstile_verified",
          ]}
          actions={(r: any) => (
            <>
              <button
                onClick={() =>
                  patch("/api/admin/beta/applications", {
                    id: r.id,
                    status: "approved",
                  })
                }
                className="text-emerald-200"
              >
                Approve
              </button>
              <button
                onClick={() =>
                  patch("/api/admin/beta/applications", {
                    id: r.id,
                    status: "rejected",
                  })
                }
                className="text-red-200"
              >
                Reject
              </button>
              <button
                onClick={() =>
                  patch("/api/admin/beta/applications", {
                    id: r.id,
                    status: "waitlist",
                  })
                }
                className="text-sky-200"
              >
                Waitlist
              </button>
            </>
          )}
        />
      )}{" "}
      {tab === "Testers" && (
        <Table
          rows={testers}
          cols={[
            "name",
            "email",
            "tester_type",
            "status",
            "weekly_required_tests",
            "weekly_completed_tests",
            "current_week_start",
            "last_active_at",
          ]}
          actions={(r: any) => (
            <>
              <button
                onClick={() =>
                  patch("/api/admin/beta/testers", {
                    id: r.id,
                    status: "paused",
                  })
                }
              >
                Pause
              </button>
              <button
                onClick={() =>
                  patch("/api/admin/beta/testers", {
                    id: r.id,
                    status: "removed",
                  })
                }
              >
                Remove
              </button>
            </>
          )}
        />
      )}{" "}
      {tab === "Tasks" && (
        <>
          <h2 className="text-2xl font-black">Task Templates</h2><p className="mb-4 text-sm text-white/55">Internal setup only. Active/draft templates are deduped by title and tester type.</p><TaskForm />
          <section className="mb-4 rounded-3xl border border-white/10 bg-white/[.04] p-4">
            <p className="text-xs font-black uppercase tracking-[.2em] text-white/45">
              Status filter
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["active", "draft"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setTaskStatusFilter(status)}
                  className={`rounded-full px-3 py-2 text-xs font-black ${taskStatusFilter === status ? "bg-rose-600 text-white" : "border border-white/10 bg-black/20 text-white/70"}`}
                >
                  {status === "active" ? "Active" : "Draft"}
                </button>
              ))}
            </div>
          </section>
          <section className="mb-4 rounded-3xl border border-white/10 bg-white/[.04] p-4">
            <p className="text-xs font-black uppercase tracking-[.2em] text-white/45">
              Category filter
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {betaSuggestedPromptCategories.map((category) => (
                <span
                  key={category.id}
                  className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-black text-white/70"
                >
                  {category.label}
                </span>
              ))}
            </div>
          </section>
          <Table
            rows={filteredTasks}
            cols={[
              "title",
              "tester_type",
              "feature_area",
              "status",
              "test_url",
              "prompt_mode",
              "allow_custom_prompt",
              "custom_prompt_required",
            ]}
            emptyMessage={taskStatusFilter === "active" ? "No active beta task templates found." : "No draft beta task templates found."}
          />
        </>
      )}{" "}
      {tab === "Feedback" && (
        <Table
          rows={feedback}
          cols={[
            "created_at",
            "feedback_type",
            "feature_area",
            "search_query",
            "submitted_prompt",
            "expected_result",
            "actual_result",
            "result_accuracy_rating",
            "speed_rating",
            "status",
            "turnstile_verified",
          ]}
          actions={(r: any) => (
            <>
              <button
                onClick={() =>
                  patch("/api/admin/beta/feedback", {
                    id: r.id,
                    status: "reviewing",
                  })
                }
              >
                Review
              </button>
              <button
                onClick={() =>
                  patch("/api/admin/beta/feedback", {
                    id: r.id,
                    status: "fixed",
                  })
                }
              >
                Fixed
              </button>
            </>
          )}
        />
      )}{" "}
      {tab === "Bugs" && (
        <Table
          rows={bugs}
          cols={[
            "created_at",
            "title",
            "severity",
            "feature_area",
            "status",
            "turnstile_verified",
          ]}
          actions={(r: any) => (
            <>
              <button
                onClick={() =>
                  patch("/api/admin/beta/bugs", {
                    id: r.id,
                    status: "confirmed",
                  })
                }
              >
                Confirm
              </button>
              <button
                onClick={() =>
                  patch("/api/admin/beta/bugs", { id: r.id, status: "fixed" })
                }
              >
                Fixed
              </button>
            </>
          )}
        />
      )}{" "}
      {tab === "Search Speed" && (
        <Table
          rows={searchLogs}
          cols={[
            "created_at",
            "source",
            "search_query",
            "used_custom_prompt",
            "total_ms",
            "llm_ms",
            "rpc_ms",
            "pairing_ms",
            "photo_filter_ms",
            "result_count",
            "speed_status",
            "success",
            "error_message",
          ]}
        />
      )}{" "}
      {tab === "Custom Prompts" && (
        <div className="space-y-4">
          <h2 className="text-xl font-black">Recent custom prompts</h2>
          <Table
            rows={[
              ...(customPrompts.assignments || []).map((r: any) => ({
                ...r,
                source: "assignment",
              })),
              ...(customPrompts.logs || []).map((r: any) => ({
                ...r,
                submitted_prompt: r.search_query,
                source: r.source,
              })),
            ]}
            cols={[
              "created_at",
              "source",
              "submitted_prompt",
              "speed_status",
              "total_ms",
              "result_accuracy_rating",
              "speed_rating",
              "status",
            ]}
            actions={(r: any) => (
              <Link
                href={`/admin/dashboard/search-health?q=${encodeURIComponent(r.submitted_prompt || r.search_query || "")}`}
                className="text-rose-200"
              >
                Run in Search Health
              </Link>
            )}
          />
          <p className="text-sm text-white/55">
            Prompt review notes will appear here after training example storage
            is connected.
          </p>
        </div>
      )}{" "}
      {tab === "Reminders" && (
        <>
          <ReminderButtons />
          <Table
            rows={reminders}
            cols={[
              "created_at",
              "email",
              "reminder_type",
              "subject",
              "status",
              "week_start",
              "weekly_completed_tests",
              "incomplete_task_count",
              "sent_at",
              "error_message",
            ]}
          />
        </>
      )}{" "}
      {tab === "Turnstile" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/[.04] p-5">
            <h2 className="text-xl font-black">Turnstile status</h2>
            {Object.entries(turnstile.status || turnstile || {}).map(
              ([k, v]) => (
                <p key={k} className="mt-2 text-sm text-white/70">
                  {k}:{" "}
                  <Badge tone={tone(String(v))}>
                    {Array.isArray(v) ? v.join(", ") : String(v)}
                  </Badge>
                </p>
              ),
            )}
          </div>
          <Table
            rows={turnstile.logs || []}
            cols={[
              "created_at",
              "source",
              "action",
              "hostname",
              "success",
              "error_codes",
            ]}
          />
        </div>
      )}{" "}
      {tab === "Settings" && (
        <section className="rounded-3xl border border-white/10 bg-white/[.04] p-6 text-white/70">
          <h2 className="text-2xl font-black text-white">Beta settings</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            <li>Weekly required tests default: 5.</li>
            <li>
              Reminder schedule: Monday weekly tasks, Wednesday midweek,
              Thursday incomplete, Friday final.
            </li>
            <li>
              Beta debug visibility is limited to beta testers and admins.
            </li>
            <li>
              Custom prompt testing helps capture real user search language.
            </li>
            <li>
              Turnstile protects public beta applications and anonymous
              feedback/bug reports without exposing secret keys.
            </li>
          </ul>
        </section>
      )}
    </div>
  );
}
function Stat({ label, value }: { label: string; value: any }) { return <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="text-xs text-white/55">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>; }
function averageSteps(rows: any[]) { if (!rows.length) return "0/5"; const avg = rows.reduce((sum, row) => sum + Number(String(row.steps_completed || "0").split("/")[0] || 0), 0) / rows.length; return `${avg.toFixed(1)}/5`; }
function Table({
  rows,
  cols,
  actions,
  emptyMessage = "No records yet.",
}: {
  rows: any[];
  cols: string[];
  actions?: (r: any) => any;
  emptyMessage?: string;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#120d0b]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-[.18em] text-white/45">
            <tr>
              {cols.map((c) => (
                <th key={c} className="p-3">
                  {c}
                </th>
              ))}
              {actions && <th className="p-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r, i) => (
                <tr
                  key={r.id || i}
                  className="border-t border-white/10 align-top"
                >
                  <>
                    {cols.map((c) => (
                      <td key={c} className="max-w-[320px] truncate p-3">
                        {typeof r[c] === "boolean" ? (
                          <Badge tone={r[c] ? "positive" : "danger"}>
                            {String(r[c])}
                          </Badge>
                        ) : c.includes("status") || c === "severity" ? (
                          <Badge tone={tone(r[c])}>{r[c] ?? "—"}</Badge>
                        ) : Array.isArray(r[c]) ? (
                          r[c].join(", ")
                        ) : (
                          (r[c] ?? "—")
                        )}
                      </td>
                    ))}
                  </>
                  {actions && (
                    <td className="flex gap-2 p-3 text-xs font-bold">
                      {actions(r)}
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td className="p-6 text-white/60" colSpan={cols.length + 1}>
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function TaskForm() {
  async function submit(fd: FormData) {
    await fetch("/api/admin/beta/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(fd.entries())),
    });
    location.reload();
  }
  const input =
    "rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white";
  return (
    <form
      action={submit}
      className="mb-4 grid gap-3 rounded-3xl border border-white/10 bg-white/[.04] p-4 md:grid-cols-4"
    >
      <input name="title" required placeholder="Task title" className={input} />
      <input name="feature_area" placeholder="feature_area" className={input} />
      <input
        name="test_url"
        placeholder="/create?betaTask=..."
        className={input}
      />
      <select name="prompt_mode" className={input}>
        <option>predefined</option>
        <option>custom</option>
        <option>either</option>
      </select>
      <input
        name="predefined_prompt"
        placeholder="Predefined prompt"
        className={`${input} md:col-span-2`}
      />
      <label className="text-sm text-white/70">
        <input
          type="checkbox"
          name="allow_custom_prompt"
          value="true"
          className="mr-2"
        />
        Allow custom prompt
      </label>
      <label className="text-sm text-white/70">
        <input
          type="checkbox"
          name="custom_prompt_required"
          value="true"
          className="mr-2"
        />
        Require custom
      </label>
      <button className="rounded-full bg-rose-600 px-4 py-2 text-sm font-black text-white">
        Create task
      </button>
    </form>
  );
}
function ReminderButtons() {
  async function send(reminderType: string) {
    await fetch("/api/admin/beta/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminderType }),
    });
    location.reload();
  }
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <button
        onClick={() => send("weekly_tasks")}
        className="rounded-full bg-rose-600 px-4 py-2 text-xs font-black"
      >
        Send Weekly Reminders
      </button>
      <button
        onClick={() => send("midweek_reminder")}
        className="rounded-full bg-white/10 px-4 py-2 text-xs font-black"
      >
        Send Midweek Reminders
      </button>
      <button
        onClick={() => send("friday_final_reminder")}
        className="rounded-full bg-white/10 px-4 py-2 text-xs font-black"
      >
        Send Friday Reminders
      </button>
    </div>
  );
}

function ControlCard({ title, description, enabled, onToggle, actions }: any) { return <section className="rounded-3xl border border-white/10 bg-white/[.04] p-5"><div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-white/60">{description}</p></div><button onClick={onToggle} className={`rounded-full px-4 py-2 text-xs font-black ${enabled ? "bg-emerald-500/20 text-emerald-100" : "bg-white/10 text-white/70"}`}>{enabled ? "On" : "Off"}</button></div><div className="mt-4 flex flex-wrap gap-2">{actions}</div></section>; }
