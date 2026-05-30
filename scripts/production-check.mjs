#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const scripts = packageJson.scripts || {};
const checks = [
  { label: 'Typecheck', script: 'typecheck', required: true },
  { label: 'Lint', script: 'lint', required: false },
  { label: 'Build', script: 'build', required: true },
  { label: 'E2E', script: 'test:e2e', required: false },
];

let failed = false;

console.log('TheOutHaven production readiness check');
console.log('==========================================');

for (const check of checks) {
  if (!scripts[check.script]) {
    const message = `${check.label} skipped — npm script "${check.script}" is not defined.`;
    if (check.required) {
      console.error(`❌ ${message}`);
      failed = true;
    } else {
      console.log(`⚠️ ${message}`);
    }
    continue;
  }

  const code = await runNpmScript(check.script);
  if (code === 0) {
    console.log(`✅ ${check.label} passed`);
  } else {
    failed = true;
    console.error(`❌ ${check.label} failed via npm run ${check.script}`);
    if (check.script === 'test:e2e') {
      console.error('Failed route: see the Playwright test title above, especially tests named "route health: <route>".');
    }
    break;
  }
}

if (failed) {
  console.error('Production readiness failed. Fix the failed check above before deployment.');
  process.exit(1);
}

console.log('✅ Production readiness passed');

function runNpmScript(script) {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', script], {
      cwd: new URL('..', import.meta.url),
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}
