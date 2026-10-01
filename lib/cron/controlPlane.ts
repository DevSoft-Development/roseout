import cronRegistry from "@/config/cron-jobs.json";
import awsActivationManifest from "@/infra/aws/edge-runtime/activation.json";
import awsScheduleManifest from "@/infra/aws/edge-runtime/schedules.json";

export type CronDelivery = "managed" | "direct";

export type CronDefinition = {
  jobKey: string;
  jobName: string;
  targetPath: string;
  delivery: CronDelivery;
  manuallyRunnable: boolean;
};

export type VercelCronSchedule = {
  path: string;
  schedule: string;
};

export type AwsCronSchedule = {
  name: string;
  expression: string;
  function: string;
  body?: Record<string, unknown>;
  enabled: boolean;
};

const definitions = cronRegistry as CronDefinition[];
const byKey = new Map(definitions.map((item) => [item.jobKey, item]));
const awsEnabled = new Set((awsActivationManifest as { enabled?: string[] }).enabled ?? []);

export function cronDefinitions() {
  return definitions;
}

export function cronDefinition(jobKey: string) {
  return byKey.get(jobKey) ?? null;
}

export function humanizeCronKey(jobKey: string) {
  return jobKey
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function awsCronSchedules() {
  const schedules = new Map<string, AwsCronSchedule>();
  for (const entry of awsScheduleManifest as Array<Omit<AwsCronSchedule, "enabled">>) {
    schedules.set(entry.name, {
      ...entry,
      enabled: awsEnabled.has(entry.name),
    });
  }
  return schedules;
}

export function vercelCronSchedules() {
  // Vercel cron ownership is retired. Keep the compatibility surface empty
  // while callers transition fully to AWS scheduler metadata.
  return new Map<string, VercelCronSchedule>();
}

export function scheduleHintFor(jobKey: string) {
  const aws = awsCronSchedules().get(jobKey);
  if (aws) return `AWS EventBridge: ${aws.expression}`;
  const schedule = vercelCronSchedules().get(jobKey)?.schedule;
  return schedule ? `Vercel cron: ${schedule}` : null;
}