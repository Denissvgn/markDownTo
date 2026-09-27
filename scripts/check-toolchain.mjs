import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';

const root = new URL('../', import.meta.url);
const nodeVersion = (await readFile(new URL('.nvmrc', root), 'utf8')).trim();
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const npmVersion = /^npm@(\d+\.\d+\.\d+)$/.exec(manifest.packageManager)?.[1];
const actualNpm = /^npm\/([^ ]+)/.exec(process.env.npm_config_user_agent ?? '')?.[1];
if (!npmVersion || process.version !== `v${nodeVersion}` || actualNpm !== npmVersion) {
  throw new Error(`Use Node ${nodeVersion} and npm ${npmVersion} (received ${process.version}, npm ${actualNpm ?? 'unknown'}). See docs/development.md.`);
}
process.stdout.write(`Toolchain: Node ${nodeVersion}, npm ${npmVersion}\n`);
