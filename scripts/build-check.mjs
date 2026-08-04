import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');
const webDir = process.cwd();
const envFile = resolve(webDir, 'next-env.d.ts');

// Next.js rewrites next-env.d.ts to point at the active distDir while it
// builds. BUILD_CHECK uses .next-check, so we restore the .next reference
// afterwards to keep typechecking/editors working with the dev server.
const originalEnvFile = readFileSync(envFile, 'utf8');

const result = spawnSync(process.execPath, [nextBin, 'build'], {
  cwd: webDir,
  env: { ...process.env, BUILD_CHECK: '1' },
  stdio: 'inherit',
});

writeFileSync(envFile, originalEnvFile);
rmSync(resolve(webDir, '.next-check'), { recursive: true, force: true });

process.exit(result.status ?? 1);
