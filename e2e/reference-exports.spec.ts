import { expect, test } from './fixtures';
import type { Page, TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const source = `# Reference Export

[**Full label**][docs]

[Collapsed][]

[Shortcut]

![Full alt][image]

![Collapsed image][]

![Shortcut image]

[Unsafe link][bad]

![Unsafe image][bad]

[docs]: /full_(one)?x=1&y=%26 "Full title"
[Collapsed]: /collapsed "Collapsed title"
[Shortcut]: /shortcut "Shortcut title"
[image]: https://example.test/pixel.svg "Image title"
[Collapsed image]: https://example.test/pixel.svg "Image title"
[Shortcut image]: https://example.test/pixel.svg "Image title"
[bad]: javascript&colon;globalThis.__referenceProbe=1
`;

async function save(page: Page, testInfo: TestInfo, format: string, name: string) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: `Download ${format}`, exact: true }).click();
  const download = await waiting;
  const path = testInfo.outputPath(name);
  await download.saveAs(path);
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format.toLowerCase()}$`));
  const bytes = await readFile(path);
  expect(bytes.length).toBeGreaterThan(0);
  return { path, bytes };
}

test('saves reference-aware HTML/XML and preserves safe semantics through XML import', async ({ page, context, browser }, testInfo) => {
  await context.route('https://example.test/pixel.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>' }));
  await page.goto('/');
  await page.getByLabel('Markdown source').fill(source);
  await page.getByRole('textbox', { name: 'Filename', exact: true }).fill('references');
  const html = await save(page, testInfo, 'HTML', 'references.html');
  const xml = await save(page, testInfo, 'XML', 'references.xml');
  const xmlData = await page.evaluate((text) => {
    const document = new DOMParser().parseFromString(text, 'application/xml');
    return {
      invalid: Boolean(document.querySelector('parsererror')),
      links: Array.from(document.querySelectorAll('link'), (node) => [node.textContent, node.getAttribute('url'), node.getAttribute('title')]),
      images: Array.from(document.querySelectorAll('image'), (node) => [node.getAttribute('alt'), node.getAttribute('url'), node.getAttribute('title')])
    };
  }, xml.bytes.toString());
  expect(xmlData.invalid).toBe(false);
  expect(xmlData.links).toEqual([
    ['Full label', '/full_(one)?x=1&y=%26', 'Full title'], ['Collapsed', '/collapsed', 'Collapsed title'], ['Shortcut', '/shortcut', 'Shortcut title']
  ]);
  expect(xmlData.images).toEqual(['Full alt', 'Collapsed image', 'Shortcut image'].map((alt) => [alt, 'https://example.test/pixel.svg', 'Image title']));

  await page.locator('input[type="file"]').setInputFiles({ name: 'roundtrip.xml', mimeType: 'application/xml', buffer: xml.bytes });
  await expect(page.getByRole('textbox', { name: 'Filename', exact: true })).toHaveValue('roundtrip');
  await expect(page.getByLabel('Markdown source')).toHaveValue(/Full label/);
  await expect(page.getByLabel('Markdown source')).not.toHaveValue(/\[docs\]:/);
  const roundtrip = await save(page, testInfo, 'HTML', 'roundtrip.html');
  const isolated = await browser.newContext();
  const errors: string[] = [];
  isolated.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  await isolated.route('https://example.test/pixel.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>' }));
  try {
  for (const artifact of [html, roundtrip]) {
    const output = await isolated.newPage();
    await output.addInitScript(() => { Reflect.set(globalThis, '__referenceProbe', 0); });
    await output.goto(pathToFileURL(artifact.path).href);
    await expect(output.locator('a')).toHaveCount(3);
    await expect(output.locator('img')).toHaveCount(3);
    expect(await output.locator('a').evaluateAll((nodes) => nodes.map((node) => [node.textContent, node.getAttribute('href'), node.getAttribute('title')]))).toEqual(xmlData.links);
    expect(await output.locator('img').evaluateAll((nodes) => nodes.map((node) => [node.getAttribute('alt'), node.getAttribute('src'), node.getAttribute('title')]))).toEqual(xmlData.images);
    await expect(output.locator('a strong')).toHaveText('Full label');
    await output.getByText('Unsafe link', { exact: true }).click();
    expect(await output.evaluate(() => Reflect.get(globalThis, '__referenceProbe'))).toBe(0);
    await output.addScriptTag({ content: 'globalThis.__executionControl = 1;' });
    expect(await output.evaluate(() => Reflect.get(globalThis, '__executionControl'))).toBe(1);
    await output.close();
  }
  expect(errors).toEqual([]);
  } finally {
    await testInfo.attach('exported-document-page-errors', { body: JSON.stringify(errors), contentType: 'application/json' });
    await isolated.close();
  }
});
