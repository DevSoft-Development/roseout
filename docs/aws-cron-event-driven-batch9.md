# AWS cron event-driven batch 9

This batch makes change-driven execution the primary path for durable worker jobs that are already supported by the unified AWS worker dispatcher.

- `enqueueWorkerJob` persists the durable database job first, then requests an asynchronous AWS dispatcher invocation through the HMAC platform job gateway.
- Unsupported worker job types are never sent to the unified dispatcher.
- `worker-dispatcher-unified` remains enabled every five minutes only as a recovery sweep if the immediate kick cannot be delivered.
- Website standby replication failures immediately request `website-replica-repair`; its 15-minute EventBridge schedule remains the safety reconciliation path.
- Four low-yield Vercel polling crons move to AWS with reduced safety cadences: search phase 13 hourly, HF inventory hourly, website replica repair every 15 minutes, and cron alert dispatch every 10 minutes.
- Batch 9 activation is fail-closed against the previous 28-schedule AWS fleet.
- Virginia Supabase `pg_cron` is not used.
