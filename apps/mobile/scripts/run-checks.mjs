/**
 * Runs every scripts/check-*.mjs suite and summarises (npm run check).
 *
 * Each check script is standalone so it can be run on its own; this wrapper is
 * what CI and "did I break anything?" use.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir)
  .filter((f) => /^check-.*\.mjs$/.test(f))
  .sort();

if (files.length === 0) {
  console.error('No check scripts found in scripts/.');
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', join(dir, file)], {
    encoding: 'utf8',
    env: process.env,
  });
  const stdout = (result.stdout ?? '').trim();
  const lastLine = stdout.split('\n').filter(Boolean).pop() ?? '(no output)';
  const ok = result.status === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${file.padEnd(22)} ${lastLine}`);
  if (!ok) {
    const stderr = (result.stderr ?? '').trim().split('\n').slice(-8).join('\n');
    if (stderr) console.log(stderr);
  }
}

console.log(`\n${files.length - failed}/${files.length} check suites passed`);
process.exit(failed === 0 ? 0 : 1);
