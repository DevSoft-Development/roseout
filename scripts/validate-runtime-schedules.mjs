import fs from 'node:fs';

const schedulePath = process.env.RUNTIME_SCHEDULES_FILE || 'infra/aws/edge-runtime/schedules.json';
const requiredNames = process.argv.slice(2);

let schedules;
try {
  schedules = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
} catch (error) {
  throw new Error(`Unable to parse ${schedulePath}: ${error instanceof Error ? error.message : String(error)}`);
}

if (!Array.isArray(schedules) || schedules.length === 0) {
  throw new Error(`${schedulePath} must contain a non-empty schedule array`);
}

const seen = new Set();
for (const [index, schedule] of schedules.entries()) {
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
    throw new Error(`Schedule at index ${index} must be an object`);
  }

  for (const field of ['name', 'expression', 'function']) {
    if (typeof schedule[field] !== 'string' || schedule[field].trim().length === 0) {
      throw new Error(`Schedule at index ${index} must have a non-empty ${field}`);
    }
  }

  if (!schedule.body || typeof schedule.body !== 'object' || Array.isArray(schedule.body)) {
    throw new Error(`Schedule ${schedule.name} must have an object body`);
  }

  if (seen.has(schedule.name)) {
    throw new Error(`Duplicate schedule name: ${schedule.name}`);
  }
  seen.add(schedule.name);
}

for (const name of requiredNames) {
  if (!seen.has(name)) {
    throw new Error(`Required runtime schedule is missing: ${name}`);
  }
}

console.log(`runtime_schedule_inventory=pass count=${schedules.length} required=${requiredNames.length}`);
