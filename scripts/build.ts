import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assetHashes, identityPath, projectRoot, sourceIdentity } from './build-identity.ts';
import type { BuildIdentity } from './build-identity.ts';

const before = await sourceIdentity();
for (const [entry, ...args] of [['typescript/bin/tsc', '-b'], ['vite/bin/vite.js', 'build']]) {
  const result = spawnSync(process.execPath, [join(projectRoot, 'node_modules', entry), ...args], { cwd: projectRoot, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const after = await sourceIdentity();
if (before.sourceDigest !== after.sourceDigest) throw new Error('Source changed during build; retry with a stable checkout.');
const assets = await assetHashes();
if (!assets['index.html'] || !Object.keys(assets).some((name) => name.endsWith('.js'))) throw new Error('Production build has no index or JavaScript bundle.');
const identity: BuildIdentity = {
  schema: 1,
  node: process.version,
  npm: /^npm\/([^ ]+)/.exec(process.env.npm_config_user_agent ?? '')?.[1] ?? 'unknown',
  ...before,
  assets
};
await mkdir(dirname(identityPath), { recursive: true });
await writeFile(identityPath, JSON.stringify(identity, null, 2) + '\n');
process.stdout.write(`Recorded build identity ${identity.sourceDigest}\n`);
