#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { delimiter, join } from 'node:path';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const binName = process.platform === 'win32' ? 'playwright.cmd' : 'playwright';
const localPlaywright = join(projectRoot, 'node_modules', '.bin', binName);

try {
  await access(localPlaywright);
} catch {
  console.log('⚠️ Playwright is not installed in node_modules; skipping optional E2E checks.');
  console.log('   Run npm install or npm ci, then npm run test:e2e to execute them.');
  process.exit(0);
}

const child = spawn(localPlaywright, ['test'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    PATH: `${join(projectRoot, 'node_modules', '.bin')}${delimiter}${process.env.PATH || ''}`,
  },
});

child.on('close', (code) => process.exit(code ?? 1));
child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
