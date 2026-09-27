import { expect, test } from './fixtures';
import { readFile, writeFile } from 'node:fs/promises';

test('edits, previews, imports, and downloads Markdown and DOCX', async ({ page }, testInfo) => {
  await page.goto('/');

  const editor = page.getByLabel('Markdown source');
  await editor.fill(`# Browser Smoke

| Format | Status |
| --- | --- |
| DOCX | Active |
`);

  await expect(page.getByRole('heading', { name: 'Browser Smoke' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();

  const importPath = testInfo.outputPath('imported.md');
  await writeFile(importPath, '# Imported File\n\n- [x] Imported task');
  await page.locator('input[type="file"]').setInputFiles(importPath);

  await expect(editor).toHaveValue('# Imported File\n\n- [x] Imported task');
  await expect(page.getByRole('heading', { name: 'Imported File' })).toBeVisible();

  const markdownDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /download markdown/i }).click();
  const markdownDownload = await markdownDownloadPromise;

  expect(markdownDownload.suggestedFilename()).toBe('imported.md');
  const savedMarkdown = testInfo.outputPath('saved.md');
  await markdownDownload.saveAs(savedMarkdown);
  expect(await markdownDownload.failure()).toBeNull();
  expect(await readFile(savedMarkdown, 'utf8')).toBe(await editor.inputValue());

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /download docx/i }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('imported.docx');
  const savedDocx = testInfo.outputPath('saved.docx');
  await download.saveAs(savedDocx);
  expect(await download.failure()).toBeNull();
  expect((await readFile(savedDocx)).subarray(0, 2).toString()).toBe('PK');
});

test('keeps visible spacing between consecutive preview tables', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Markdown source').fill(`| A | B |
| --- | --- |
| 1 | 2 |

| C | D |
| --- | --- |
| 3 | 4 |
`);

  const tables = page.locator('.markdown-preview table');
  await expect(tables).toHaveCount(2);

  const gap = await tables.evaluateAll(([firstTable, secondTable]) => {
    const first = firstTable.getBoundingClientRect();
    const second = secondTable.getBoundingClientRect();
    return second.top - first.bottom;
  });

  expect(gap).toBeGreaterThanOrEqual(16);
});
