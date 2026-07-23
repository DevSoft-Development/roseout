export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "dead_letter";
export type WorkerJob = { id: string; job_type: string; payload: Record<string, unknown>; attempt_count: number; max_attempts: number; checkpoint: Record<string, unknown>; cancellation_requested_at?: string | null; };
export type HandlerResult = { progress?: { current: number; total?: number }; checkpoint?: Record<string, unknown>; result?: Record<string, unknown>; retryAfterSeconds?: number };
export type JobHandler = (job: WorkerJob, ctx: WorkerContext) => Promise<HandlerResult>;
export type WorkerContext = { supabase: SupabaseLike; deadline: number; workerId: string; log: (event: string, metadata?: Record<string, unknown>) => void };
export type SupabaseLike = { rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>; from: (table: string) => unknown };
