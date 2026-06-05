#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const vitest = require('../index.cjs');
globalThis.describe = vitest.describe;
globalThis.it = vitest.it;
globalThis.test = vitest.test;
globalThis.expect = vitest.expect;
globalThis.beforeEach = vitest.beforeEach;
globalThis.afterEach = vitest.afterEach;
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'local-test-service-role-key';
require.extensions['.ts'] = function(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const out = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      jsx: ts.JsxEmit.ReactJSX,
      baseUrl: process.cwd(),
      paths: { '@/*': ['./*'] },
    },
    fileName: filename,
  }).outputText;
  module._compile(out, filename);
};
function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(test|spec)\.ts$/.test(entry.name)) files.push(full);
  }
  return files;
}
const args = process.argv.slice(2);
const runIndex = args[0] === 'run' ? 1 : 0;
const targets = args.slice(runIndex).filter((arg) => !arg.startsWith('-'));
const roots = targets.length ? targets : ['.'];
const files = roots.flatMap((target) => {
  const resolved = path.resolve(process.cwd(), target);
  if (!fs.existsSync(resolved)) return [];
  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) return walk(resolved);
  return /\.(test|spec)\.ts$/.test(resolved) ? [resolved] : [];
});
if (!files.length) {
  console.error('No test files found');
  process.exit(1);
}
for (const file of files) require(file);
let failed = 0;
for (const t of vitest.__state.tests) {
  try {
    if (vitest.__state.beforeEach) await vitest.__state.beforeEach();
    await t.fn();
    if (vitest.__state.afterEach) await vitest.__state.afterEach();
    console.log(`✓ ${t.name}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${t.name}`);
    console.error(error?.stack || error);
  }
}
console.log(`\n${vitest.__state.tests.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
