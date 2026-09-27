import { expect, test } from './fixtures';
import type { Page, TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const table = '<table><tr><th>Key</th></tr><tr><td>Value</td></tr></table>';
const literal = `\`\`\`html\n${table}\n\`\`\``;

async function savedSource(page: Page, testInfo: TestInfo, button: string, name: string) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  const download = await waiting;
  const path = testInfo.outputPath(name);
  await download.saveAs(path);
  expect(await download.failure()).toBeNull();
  return readFile(path, 'utf8');
}

async function paste(page: Page, plain: string, html: string, start: number) {
  await page.getByLabel('Markdown source').evaluate((element, clipboard) => {
    const textarea = element as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(clipboard.start, clipboard.start);
    const data = new DataTransfer();
    data.setData('text/plain', clipboard.plain);
    data.setData('text/html', clipboard.html);
    textarea.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, { plain, html, start });
}

test('preserves stored CRLF source on reload and recovers explicit conversion', async ({ page }, testInfo) => {
  const source = `# Stored\n\n${literal}\n\n${table}`.replaceAll('\n', '\r\n');
  await page.addInitScript((value) => {
    if (!sessionStorage.getItem('source-seeded')) {
      localStorage.setItem('markdown-to:draft', value);
      sessionStorage.setItem('source-seeded', 'yes');
    }
  }, source);
  await page.goto('/');
  await expect(page.getByLabel('Markdown source')).toHaveValue(source.replaceAll('\r\n', '\n'));
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem('markdown-to:draft'))).toBe(source);
  expect(await savedSource(page, testInfo, 'Download Markdown', 'before.md')).toBe(source);
  await page.getByRole('button', { name: 'Convert HTML Tables', exact: true }).click();
  const converted = await savedSource(page, testInfo, 'Download Markdown', 'converted.md');
  expect(converted).toContain(literal.replaceAll('\n', '\r\n'));
  expect(converted).toContain('| Key |\r\n| --- |\r\n| Value |');
  expect(await savedSource(page, testInfo, 'Download previous source', 'previous.md')).toBe(source);
  await page.getByRole('button', { name: 'Restore previous source', exact: true }).click();
  expect(await savedSource(page, testInfo, 'Download Markdown', 'restored.md')).toBe(source);
});

test('preserves code-context paste and converts only eligible inserted ranges', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByLabel('Markdown source');
  await editor.fill('before `` after');
  await paste(page, 'literal cell', table, 8);
  await expect(editor).toHaveValue('before `literal cell` after');
  await expect(page.getByText('Pasted source preserved', { exact: true })).toBeVisible();
  const existing = `${table}\n\n`;
  await editor.fill(existing);
  await paste(page, table, '', existing.length);
  await expect(editor).toHaveValue(existing + '| Key |\n| --- |\n| Value |');
  await page.getByRole('button', { name: 'Restore previous source', exact: true }).click();
  await expect(editor).toHaveValue(existing);
});

test('keeps replaced and original imported source downloadable with storage blocked', async ({ page }, testInfo) => {
  await page.goto('/');
  const editor = page.getByLabel('Markdown source');
  await editor.fill('# Previous draft');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); }; });
  const incoming = `# Incoming\n\n${literal}\n\n${table}`;
  await page.locator('input[type="file"]').setInputFiles({ name: 'incoming.md', mimeType: 'text/markdown', buffer: Buffer.from(incoming) });
  await expect(editor).toHaveValue(new RegExp('\\| Key \\|'));
  expect(await savedSource(page, testInfo, 'Download original import', 'original.md')).toBe(incoming);
  expect(await savedSource(page, testInfo, 'Download previous source', 'previous.md')).toBe('# Previous draft');
  await page.getByRole('button', { name: 'Restore previous source', exact: true }).click();
  await expect(editor).toHaveValue('# Previous draft');
  await expect(page.getByRole('status', { name: 'Browser saving' })).toContainText('could not be saved');
});
