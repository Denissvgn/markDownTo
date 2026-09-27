import { expect, test } from './fixtures';
import type { BrowserContext, Page, TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Document, ExternalHyperlink, Packer, Paragraph, TextRun } from 'docx';

const unsafeMarkdown = `# Safe formats

\`\`\`x"><svg/onload=globalThis.__p0Probe=1>
literal code
\`\`\`

\`\`\`x"><img/src=x/onerror=globalThis.__p0Probe=8>
second literal
\`\`\`

[Unsafe link](javascript:globalThis.__p0Probe=2)

[Encoded link](jav&#x61;script:globalThis.__p0Probe=3)

[Control link](java&#x09;script:globalThis.__p0Probe=5)

[Encoded scheme](java%73cript:globalThis.__p0Probe=6)

![Unsafe image](javascript:globalThis.__p0Probe=4)

![Unsafe data image](data:image/svg+xml,%3Csvg%20onload%3DglobalThis.__p0Probe%3D7%3E%3C%2Fsvg%3E)

[Safe link](https://example.test/safe)

![Safe image](https://example.test/p0-image.svg)
`;

async function safeResources(context: BrowserContext) {
  await context.route('https://example.test/safe', (route) => route.fulfill({ contentType: 'text/html', body: '<p>Safe destination</p>' }));
  await context.route('https://example.test/p0-image.svg', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="blue"/></svg>'
  }));
}

async function checkHtmlDownload(page: Page, context: BrowserContext, testInfo: TestInfo, safeImageExpected = false, codeExpected = false) {
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download HTML', exact: true }).click();
  const download = await downloadEvent;
  const path = testInfo.outputPath('saved.html');
  await download.saveAs(path);
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.html$/);
  expect((await readFile(path)).length).toBeGreaterThan(0);

  const isolated = await context.browser()!.newContext();
  const errors: string[] = [];
  isolated.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  try {
    await safeResources(isolated);
    const output = await isolated.newPage();
    await output.addInitScript(() => { Reflect.set(globalThis, '__p0Probe', 0); });
    await output.goto(pathToFileURL(path).href);
    await expect(output.locator('script, svg, [onload], [onerror]')).toHaveCount(0);
    await expect(output.getByRole('heading', { name: 'Safe formats' })).toBeVisible();
    if (codeExpected) await expect(output.locator('pre code').first()).toHaveText('literal code');
    await expect(output.getByRole('link')).toHaveCount(1);
    await expect(output.getByRole('link', { name: 'Safe link', exact: true })).toHaveAttribute('href', 'https://example.test/safe');
    await expect(output.getByRole('img', { name: 'Unsafe image', exact: true })).toHaveCount(0);
    await expect(output.getByRole('img')).toHaveCount(safeImageExpected ? 1 : 0);
    if (safeImageExpected) {
      await expect(output.getByRole('img', { name: 'Safe image', exact: true })).toBeVisible();
      expect(await output.getByRole('img', { name: 'Safe image', exact: true }).evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(10);
    }
    await output.getByText('Unsafe link', { exact: true }).click();
    expect(await output.evaluate(() => Reflect.get(globalThis, '__p0Probe'))).toBe(0);

    // A positive execution control ensures the attack is not hidden by disabled JS.
    await output.addScriptTag({ content: 'globalThis.__p0Control = 1;' });
    expect(await output.evaluate(() => Reflect.get(globalThis, '__p0Control'))).toBe(1);
    await output.getByRole('link', { name: 'Safe link', exact: true }).click();
    await expect(output.getByText('Safe destination', { exact: true })).toBeVisible();
    await output.close();
    expect(errors, 'uncaught errors in the isolated exported document').toEqual([]);
  } finally {
    await testInfo.attach('exported-document-page-errors', { body: JSON.stringify(errors), contentType: 'application/json' });
    await isolated.close();
  }
}

test.describe('P0 HTML export safety', () => {
  test.beforeEach(async ({ context }) => { await safeResources(context); });

  test('opens the actual HTML download with inert fence and encoded-link payloads', async ({ page, context }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByLabel('Markdown source').fill(unsafeMarkdown);
    await checkHtmlDownload(page, context, testInfo, true, true);
    expect(errors).toEqual([]);
  });

  for (const format of ['Markdown', 'HTML', 'XML', 'DOCX'] as const) {
    test(`keeps imported ${format} payloads inert in the saved HTML`, async ({ page, context }, testInfo) => {
      let buffer: Buffer;
      let name: string;
      let mimeType: string;
      if (format === 'Markdown') {
        buffer = Buffer.from(unsafeMarkdown);
        name = 'source.md';
        mimeType = 'text/markdown';
      } else if (format === 'HTML') {
        buffer = Buffer.from('<h1>Safe formats</h1><pre><code class="language-x&quot;&gt;&lt;svg/onload=globalThis.__p0Probe=1&gt;">literal code</code></pre><p><a href="jav&#x61;script:globalThis.__p0Probe=2">Unsafe link</a></p><img src="jav&#x61;script:globalThis.__p0Probe=3" alt="Unsafe image"><p><a href="https://example.test/safe">Safe link</a></p>');
        name = 'source.html';
        mimeType = 'text/html';
      } else if (format === 'XML') {
        buffer = Buffer.from('<document><content><heading level="1">Safe formats</heading><code-block language="x&quot;&gt;&lt;svg/onload=globalThis.__p0Probe=1&gt;">literal code</code-block><paragraph><link url="jav&#x61;script:globalThis.__p0Probe=2">Unsafe link</link></paragraph><image url="jav&#x61;script:globalThis.__p0Probe=3" alt="Unsafe image"/><paragraph><link url="https://example.test/safe">Safe link</link></paragraph></content></document>');
        name = 'source.xml';
        mimeType = 'application/xml';
      } else {
        buffer = await Packer.toBuffer(new Document({ sections: [{ children: [
          new Paragraph({ text: 'Safe formats', heading: 'Heading1' }),
          new Paragraph({ children: [new ExternalHyperlink({ link: 'javascript:globalThis.__p0Probe=2', children: [new TextRun('Unsafe link')] })] }),
          new Paragraph({ children: [new ExternalHyperlink({ link: 'https://example.test/safe', children: [new TextRun('Safe link')] })] })
        ] }] }));
        name = 'source.docx';
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }
      await page.goto('/');
      await page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer });
      await expect(page.getByLabel('Markdown source')).toHaveValue(/Unsafe link/);
      await expect(page.getByRole('button', { name: 'Download HTML', exact: true })).toBeEnabled();
      await checkHtmlDownload(page, context, testInfo, format === 'Markdown', format !== 'DOCX');
    });
  }
});

test.describe('P0 storage failure resilience', () => {
  for (const failure of [
    { mode: 'all', exception: 'QuotaExceededError' },
    { mode: 'all', exception: 'SecurityError' },
    { mode: 'draft', exception: 'QuotaExceededError' },
    { mode: 'filename', exception: 'QuotaExceededError' },
    { mode: 'getter', exception: 'SecurityError' }
  ] as const) {
    test(`keeps work downloadable and recovers from ${failure.mode}/${failure.exception}`, async ({ page, context }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(({ mode, exception }) => {
        const storage = window.localStorage;
        const originalSetItem = Storage.prototype.setItem;
        Reflect.set(globalThis, '__p0StorageFailure', mode);
        if (mode === 'getter') {
          Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() {
              if (Reflect.get(globalThis, '__p0StorageFailure') !== 'none') {
                throw new DOMException('Storage access denied', exception);
              }
              return storage;
            }
          });
        } else {
          Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
            const current = Reflect.get(globalThis, '__p0StorageFailure');
            if (current === 'all' || (current === 'draft' && key === 'markdown-to:draft') || (current === 'filename' && key === 'markdown-to:filename')) {
              throw new DOMException('Storage write failed', exception);
            }
            originalSetItem.call(this, key, value);
          };
        }
      }, failure);
      await page.goto('/');
      const editor = page.getByLabel('Markdown source');
      const filename = page.getByRole('textbox', { name: 'Filename', exact: true });
      const status = page.getByRole('status', { name: 'Browser saving' });
      const unsaved = failure.mode === 'draft' ? 'Draft' : failure.mode === 'filename' ? 'Filename' : 'Draft and filename';
      await expect(editor).toBeVisible();
      await expect(status).toContainText(`${unsaved} could not be saved`);
      await editor.fill('# In-memory typing\n\nStill available');
      await filename.fill('typed-draft');
      await expect(page.getByRole('heading', { name: 'In-memory typing', exact: true })).toBeVisible();
      for (const format of ['Markdown', 'DOCX', 'HTML', 'XML']) {
        await expect(page.getByRole('button', { name: `Download ${format}`, exact: true })).toBeEnabled();
      }

      const imported = '# Imported while storage fails\n\nKeep this text  \n';
      await page.locator('input[type="file"]').setInputFiles({ name: 'storage-import.md', mimeType: 'text/markdown', buffer: Buffer.from(imported) });
      await expect(editor).toHaveValue(imported);
      await expect(filename).toHaveValue('storage-import');
      const latest = `${imported}\nLatest unsaved edit.`;
      await editor.fill(latest);
      await filename.fill('storage-latest');
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download Markdown', exact: true }).click();
      const download = await downloadEvent;
      const saved = testInfo.outputPath('unsaved.md');
      await download.saveAs(saved);
      expect(await download.failure()).toBeNull();
      expect(download.suggestedFilename()).toBe('storage-latest.md');
      expect(await readFile(saved, 'utf8')).toBe(latest);
      await expect(page.getByText('storage-latest.md downloaded', { exact: true })).toBeVisible();
      await expect(status).toContainText(`${unsaved} could not be saved`);

      // Successful action styling must not disguise the independent warning.
      expect(await status.locator('.persistence-warning').evaluate((warning) => getComputedStyle(warning).color === getComputedStyle(document.body).color)).toBe(true);
      if (failure.mode === 'all' && failure.exception === 'QuotaExceededError') {
        await page.screenshot({ path: testInfo.outputPath('unsaved-light.png'), fullPage: true });
      }
      await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      expect(await status.locator('.persistence-warning').evaluate((warning) => getComputedStyle(warning).color === getComputedStyle(document.body).color)).toBe(true);
      if (failure.mode === 'all' && failure.exception === 'QuotaExceededError') {
        await page.screenshot({ path: testInfo.outputPath('unsaved-dark.png'), fullPage: true });
      }
      await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
      await expect(status).toContainText(`${unsaved} could not be saved`);

      await page.evaluate(() => { Reflect.set(globalThis, '__p0StorageFailure', 'none'); });
      await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
      await expect(status).toBeEmpty();
      await expect(editor).toBeFocused();
      expect(await page.evaluate(() => localStorage.getItem('markdown-to:draft'))).toBe(latest);
      expect(await page.evaluate(() => localStorage.getItem('markdown-to:filename'))).toBe('storage-latest');
      const reopened = await context.newPage();
      await reopened.goto('/');
      await expect(reopened.getByLabel('Markdown source')).toHaveValue(latest);
      await expect(reopened.getByRole('textbox', { name: 'Filename', exact: true })).toHaveValue('storage-latest');
      await reopened.close();
      expect(errors).toEqual([]);
    });
  }
});
