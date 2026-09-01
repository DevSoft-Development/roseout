import fs from "node:fs";

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const schedules = readJson("infra/aws/edge-runtime/schedules.json");
const staged = readJson("infra/aws/edge-runtime/staged-schedules.json");
const activation = readJson("infra/aws/edge-runtime/activation.json");
const vercel = readJson("vercel.json");

const batch9 = [
  "cron-alert-dispatcher",
  "search-hf-inventory-maintenance",
  "search-phase13-maintenance",
  "website-replica-repair",
].sort();
const names = (rows) => rows.map((row) => row.name).sort();
const activeNames = new Set(names(schedules));
const stagedNames = new Set(names(staged));
const enabled = new Set(activation.enabled);
const rollback = new Set(activation.rollback_enabled);
const probes = new Set(activation.probe);
const vercelJobs = new Set(
  (vercel.crons ?? []).map((cron) => new URL(`https://local${cron.path}`).searchParams.get("job")).filter(Boolean),
);

if (activation.batch !== 9) throw new Error(`expected batch 9, got ${activation.batch}`);
if (schedules.length !== 32) throw new Error(`expected 32 active schedules, got ${schedules.length}`);
if (activation.enabled.length !== 32) throw new Error(`expected 32 enabled schedules, got ${activation.enabled.length}`);
if (activation.rollback_enabled.length !== 28) throw new Error(`expected rollback baseline 28, got ${activation.rollback_enabled.length}`);
if (staged.length !== 32) throw new Error(`expected 32 staged schedules, got ${staged.length}`);

const delta = activation.enabled.filter((name) => !rollback.has(name)).sort();
if (JSON.stringify(delta) !== JSON.stringify(batch9)) {
  throw new Error(`unexpected batch 9 delta: ${delta.join(",")}`);
}

const probeNames = [...probes].sort();
if (JSON.stringify(probeNames) !== JSON.stringify(batch9)) {
  throw new Error(`batch 9 probes must equal the new activation delta only: ${probeNames.join(",")}`);
}

for (const name of batch9) {
  if (!activeNames.has(name)) throw new Error(`batch 9 schedule missing from active inventory: ${name}`);
  if (!enabled.has(name)) throw new Error(`batch 9 schedule is not enabled: ${name}`);
  if (!probes.has(name)) throw new Error(`batch 9 schedule is not probed: ${name}`);
  if (stagedNames.has(name)) throw new Error(`batch 9 schedule still staged: ${name}`);
  if (vercelJobs.has(name)) throw new Error(`batch 9 schedule still owned by Vercel: ${name}`);
}

for (const name of stagedNames) {
  if (activeNames.has(name)) throw new Error(`active/staged overlap: ${name}`);
}

const dispatcher = schedules.find((row) => row.name === "worker-dispatcher-unified");
if (dispatcher?.expression !== "cron(0/5 * * * ? *)") {
  throw new Error(`worker dispatcher is not a five-minute recovery sweep: ${dispatcher?.expression}`);
}

console.log("batch9_event_driven_contract=pass");
