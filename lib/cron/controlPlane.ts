import cronRegistry from "@/config/cron-jobs.json";
import awsActivationManifest from "@/infra/aws/edge-runtime/activation.json";
import awsScheduleManifest from "@/infra/aws/edge-runtime/schedules.json";
import vercelConfig from "@/vercel.json";

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
  const entries = ((vercelConfig as { crons?: VercelCronSchedule[] }).crons ?? []);
  const schedules = new Map<string, VercelCronSchedule>();

  for (const entry of entries) {
    try {
      const url = new URL(entry.path, "https://theouthaven.com");
      const managedJob = url.pathname === "/api/cron/managed" ? url.searchParams.get("job") : null;
      if (managedJob) {
        schedules.set(managedJob, entry);
        continue;
      }
      const definition = definitions.find((item) => item.targetPath === entry.path);
      if (definition) schedules.set(definition.jobKey, entry);
    } catch {
      // Invalid deployment config is surfaced by Vercel at build time.
    }
  }

  return schedules;
}

export function scheduleHintFor(jobKey: string) {
  const aws = awsCronSchedules().get(jobKey);
  if (aws) return `AWS EventBridge: ${aws.expression}`;
  const schedule = vercelCronSchedules().get(jobKey)?.schedule;
  return schedule ? `Vercel cron: ${schedule}` : null;
}