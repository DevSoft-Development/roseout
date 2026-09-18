import { TeamReviewActionButton } from "./TeamReviewActionButton";

function labelize(value: unknown) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function TeamReviewList({
  title,
  description,
  rows,
  table,
}: {
  title: string;
  description: string;
  rows: any[];
  table: string;
}) {
  return (
    <main className="px-4 py-6 text-white">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-black">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm font-bold text-white/55">
          {description}
        </p>

        <div className="mt-6 grid gap-3">
          {rows.map((row) => (
            <article
              key={row.id}
              className="rounded-3xl border border-white/10 bg-[#111] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                    {labelize(
                      row.status ||
                        row.manager_review_status ||
                        row.approval_status ||
                        "pending",
                    )}
                  </p>
                  <h2 className="mt-1 text-xl font-black">
                    {row.title ||
                      row.field_name ||
                      row.action ||
                      row.proof_type ||
                      row.id}
                  </h2>
                  <p className="mt-2 text-sm font-bold text-white/55">
                    {row.reason ||
                      row.notes ||
                      row.review_notes ||
                      row.message ||
                      "No notes."}
                  </p>
                  <p className="mt-2 text-xs font-bold text-white/35">
                    {formatDateTime(
                      row.created_at || row.uploaded_at || row.visit_started_at,
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <TeamReviewActionButton
                    table={row.table || table}
                    id={row.id}
                    action="approve"
                    label="Approve"
                  />
                  <TeamReviewActionButton
                    table={row.table || table}
                    id={row.id}
                    action="reject"
                    label="Reject"
                  />
                </div>
              </div>
            </article>
          ))}

          {rows.length === 0 ? (
            <p className="rounded-3xl border border-white/10 bg-[#111] p-8 text-center text-sm font-bold text-white/45">
              No review items right now.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
