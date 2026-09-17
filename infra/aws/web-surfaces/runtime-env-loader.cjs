'use strict';

const raw = process.env.RUNTIME_ENV_JSON;
if (!raw) {
  console.error('RUNTIME_ENV_JSON is required for AWS web surfaces.');
  process.exit(1);
}

let values;
try {
  values = JSON.parse(raw);
} catch (error) {
  console.error('RUNTIME_ENV_JSON must be valid JSON.');
  process.exit(1);
}

if (!values || typeof values !== 'object' || Array.isArray(values)) {
  console.error('RUNTIME_ENV_JSON must contain an object.');
  process.exit(1);
}

for (const [key, value] of Object.entries(values)) {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
  if (value === null || value === undefined) continue;
  if (process.env[key] === undefined) process.env[key] = String(value);
}

delete process.env.RUNTIME_ENV_JSON;
