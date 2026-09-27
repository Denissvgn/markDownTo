import { test, expect } from './fixtures';
import type { Page, TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const table = '<table><tr><th>Column</th></tr><tr><td>Value</td></tr></table>';
const pipeTable = '| Column |\n| --- |\n| Value |';
const protectedSource = [
  '# Protected examples 🧩',
  ['```html', table, '```'].join('\n'),
  ['~~~~html', table, '~~~~'].join('\n'),
  ['````html', '```', table, '```', '````'].join('\n'),
  `    ${table}`,
  `Inline \`${table}\` example.`,
  `Escaped \\${table}`,
  ['```text', '|', 'sequenceDiagram', '    Reader->>Panel: Example', '|', '| --- |', '```'].join('\n'),
  ['> ```html', `> ${table}`, '> ```'].join('\n'),
  ['- Code example', '', '  ```html', `  ${table}`, '  ```'].join('\n')
].join('\n\n');
const mixedSource = `${protectedSource}\n\n${table}`;
const convertedSource = `${protectedSource}\n\n${pipeTable}`;

async function paste(page: Page, plain: string, html: string, start: number, end = start) {
  await page.getByLabel('Markdown source').evaluate((element, value) => {
    const editor = element as HTMLTextAreaElement;
    editor.focus();
    editor.setSelectionRange(value.start, value.end);
    const clipboard = new DataTransfer();
    clipboard.setData('text/plain', value.plain);
    clipboard.setData('text/html', value.html);
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }));
  }, { plain, html, start, end });
}

async function download(page: Page, testInfo: TestInfo, button: string, filename: string): Promise<string> {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  const saved = await waiting;
  const path = testInfo.outputPath(filename);
  await saved.saveAs(path);
  expect(await saved.failure()).toBeNull();
  return readFile(path, 'utf8');
}

for (const entry of ['Markdown import', 'plain-text paste', 'rich clipboard with Markdown source'] as const) {
  test(`preserves the literal-code matrix through ${entry}`, async ({ page }, testInfo) => {
    await page.goto('/');
    const editor = page.getByLabel('Markdown source');
    await editor.fill('# Previous source');
    if (entry === 'Markdown import') {
      await page.locator('input[type="file"]').setInputFiles({ name: 'matrix.md', mimeType: 'text/markdown', buffer: Buffer.from(mixedSource) });
      await expect(page.getByRole('textbox', { name: 'Filename', exact: true })).toHaveValue('matrix');
    } else {
      await paste(page, mixedSource, entry === 'plain-text paste' ? '' : table, 0, '# Previous source'.length);
    }
    await expect(editor).toHaveValue(convertedSource);
    expect(await download(page, testInfo, 'Download Markdown', 'converted.md')).toBe(convertedSource);
    expect(await download(page, testInfo, 'Download previous source', 'previous.md')).toBe('# Previous source');
    if (entry === 'Markdown import') expect(await download(page, testInfo, 'Download original import', 'original.md')).toBe(mixedSource);
    await page.getByRole('button', { name: 'Restore previous source', exact: true }).click();
    await expect(editor).toHaveValue('# Previous source');
  });
}

test('preserves the full literal-code matrix on reload and explicit conversion', async ({ page }, testInfo) => {
  await page.addInitScript((source) => {
    if (!sessionStorage.getItem('matrix-seeded')) {
      localStorage.setItem('markdown-to:draft', source);
      sessionStorage.setItem('matrix-seeded', 'yes');
    }
  }, mixedSource);
  await page.goto('/');
  const editor = page.getByLabel('Markdown source');
  await expect(editor).toHaveValue(mixedSource);
  await page.reload();
  await expect(editor).toHaveValue(mixedSource);
  expect(await download(page, testInfo, 'Download Markdown', 'reloaded.md')).toBe(mixedSource);
  await page.getByRole('button', { name: 'Convert HTML Tables', exact: true }).click();
  await expect(editor).toHaveValue(convertedSource);
  expect(await download(page, testInfo, 'Download previous source', 'original.md')).toBe(mixedSource);
  await page.getByRole('button', { name: 'Restore previous source', exact: true }).click();
  await expect(editor).toHaveValue(mixedSource);
});

test('converts an ordinary rich HTML paste without rewriting existing literal code', async ({ page }, testInfo) => {
  await page.goto('/');
  const editor = page.getByLabel('Markdown source');
  const before = protectedSource + '\n\n';
  await editor.fill(before);
  await paste(page, 'Column\nValue', table, before.length);
  await expect(editor).toHaveValue(convertedSource);
  expect(await download(page, testInfo, 'Download Markdown', 'rich-paste.md')).toBe(convertedSource);
  await page.getByRole('button', { name: 'Restore previous source', exact: true }).click();
  await expect(editor).toHaveValue(before);
});

const contexts = [
  { name: 'backtick fence', template: '```html\nPASTE\n```' },
  { name: 'tilde fence', template: '~~~~html\nPASTE\n~~~~' },
  { name: 'indented code', template: '    PASTE' },
  { name: 'inline code', template: 'before `PASTE` after' },
  { name: 'quoted fence', template: '> ```html\n> PASTE\n> ```' }
];
for (const context of contexts) {
  for (const rich of [false, true]) {
    test(`preserves ${rich ? 'rich' : 'plain'} table paste inside ${context.name}`, async ({ page }, testInfo) => {
      await page.goto('/');
      const editor = page.getByLabel('Markdown source');
      const before = context.template.replace('PASTE', '');
      await editor.fill(before);
      const position = context.template.indexOf('PASTE');
      await paste(page, table, rich ? table : '', position);
      const expected = context.template.replace('PASTE', table);
      await expect(editor).toHaveValue(expected);
      await expect(page.getByText('Pasted source preserved', { exact: true })).toBeVisible();
      expect(await download(page, testInfo, 'Download Markdown', 'literal.md')).toBe(expected);
      await page.getByRole('button', { name: 'Restore previous source', exact: true }).click();
      await expect(editor).toHaveValue(before);
    });
  }
}
