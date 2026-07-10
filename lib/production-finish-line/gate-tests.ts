type SupabaseAdminClient = {
  from: (table: string) => any;
};

export type GateCheckStatus = "passed" | "blocked" | "needs_review";
export type GateRunStatus = "passed" | "testing" | "blocked" | "needs_codex";

export type GateCheck = {
  name: string;
  status: GateCheckStatus;
  details: string;
};

export type GateRunResult = {
  title: string;
  status: GateRunStatus;
 