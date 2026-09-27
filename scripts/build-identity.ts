import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const identityPath = join(projectRoot, 'node_modules/.cache/markdown-to/build-identity.json');
export type FileHashes = Record<string, string>;
export interface BuildIdentity {
  schema: 1;
  node: string;
  npm: string;
  sourceDigest: string;
  sources: FileHashes;
  assets: FileHashes;
}

export function sha256(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function listFiles(root: string, directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isSymbolicLink()) throw new Error(`Build identity does not follow symbolic links: ${path}`);
    if (item.isDirectory()) files.push(...await listFiles(root, path));
    else if (item.isFile()) files.push(relative(root, path).split(sep).join('/'));
  }
  return files;
}

async function hashFiles(root: string, files: string[]): Promise<FileHashes> {
  const result: FileHashes = {};
  for (const file of files.sort()) result[file] = sha256(await readFile(join(root, file)));
  return result;
}

export async function sourceIdentity() {
  const files = ['.nvmrc', 'package.json', 'package-lock.json', 'index.html', 'vite.config.ts', 'vitest.config.ts', 'vitest.setup.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'tsconfig.e2e.json', 'playwright.config.ts', 'playwright.production.config.ts'];
  for (const directory of ['src', 'e2e', 'scripts']) files.push(...await listFiles(projectRoot, join(projectRoot, directory)));
  const sources = await hashFiles(projectRoot, files);
  return { sources, sourceDigest: sha256(JSON.stringify(sources)) };
}

export async function assetHashes(): Promise<FileHashes> {
  const root = join(projectRoot, 'dist');
  return hashFiles(root, await listFiles(root, root));
}
