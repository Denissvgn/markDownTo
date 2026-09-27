import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { assetHashes, identityPath, sha256, sourceIdentity } from '../scripts/build-identity.ts';
import type { BuildIdentity } from '../scripts/build-identity.ts';

type VerifiedBuild = BuildIdentity & { browserVersion: string; executable: string; baseURL: string; configFile: string; project: string };

export const test = base.extend<{ diagnostics: void }, { verifiedBuild: VerifiedBuild | null }>({
  verifiedBuild: [async ({ playwright, browser }, use, workerInfo) => {
    if (workerInfo.config.metadata.build !== 'production') { await use(null); return; }
    expect(workerInfo.config.webServer, 'one explicit production server').not.toBeNull();
    const identity = JSON.parse(await readFile(identityPath, 'utf8')) as BuildIdentity;
    const current = await sourceIdentity();
    expect(identity.schema).toBe(1);
    expect(identity.node).toBe(process.version);
    expect(identity.sourceDigest).toBe(current.sourceDigest);
    expect(identity.sources).toEqual(current.sources);
    expect(identity.assets).toEqual(await assetHashes());
    const baseURL = workerInfo.project.use.baseURL;
    if (!baseURL) throw new Error('Production tests require a base URL.');
    const request = await playwright.request.newContext({ baseURL });
    try {
      for (const [path, digest] of Object.entries(identity.assets)) {
        const response = await request.get('/' + path.split('/').map(encodeURIComponent).join('/'));
        expect(response.status(), `served ${path}`).toBe(200);
        expect(new URL(response.url()).origin).toBe(new URL(baseURL).origin);
        expect(sha256(await response.body()), `served bytes for ${path}`).toBe(digest);
      }
    } finally { await request.dispose(); }
    await use({ ...identity, browserVersion: browser.version(), executable: playwright.chromium.executablePath(), baseURL, configFile: workerInfo.config.configFile ?? '<inline>', project: workerInfo.project.name });
    expect((await sourceIdentity()).sourceDigest, 'source changed during browser tests').toBe(identity.sourceDigest);
    expect(await assetHashes(), 'build changed during browser tests').toEqual(identity.assets);
  }, { scope: 'worker' }],
  diagnostics: [async ({ context, verifiedBuild }, use, testInfo) => {
    const errors: Array<{ url: string; message: string }> = [];
    const observe = (page: import('@playwright/test').Page) => {
      page.on('pageerror', (error) => errors.push({ url: page.url(), message: error.message }));
    };
    context.on('page', observe);
    context.pages().forEach(observe);
    try { await use(); }
    finally {
      await testInfo.attach('page-errors', { body: JSON.stringify(errors), contentType: 'application/json' });
      if (verifiedBuild) await testInfo.attach('build-identity', { body: JSON.stringify(verifiedBuild), contentType: 'application/json' });
      expect(errors, 'uncaught browser page errors').toEqual([]);
    }
  }, { auto: true }]
});
export { expect };
