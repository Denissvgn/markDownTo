import { test, expect } from './fixtures';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Document, Packer, Paragraph } from 'docx';
import JSZip from 'jszip';

for (const input of ['md', 'html', 'xml', 'docx'] as const) {
  test(`${input} import produces four saved semantic artifacts`, async ({ page }, testInfo) => {
    const text = 'Artifact matrix';
    const source = input === 'docx'
      ? await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph(text)] }] }))
      : Buffer.from(input === 'md' ? `# ${text}\n\nUnicode: café` : input === 'html'
        ? `<h1>${text}</h1><p>Unicode: café</p>`
        : `<document><content><heading level="1">${text}</heading><paragraph>Unicode: café</paragraph></content></document>`);
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles({ name: `matrix.${input}`, mimeType: 'application/octet-stream', buffer: source });
    const editor = page.getByLabel('Markdown source');
    await expect(editor).toHaveValue(new RegExp(text));
    const markdown = await editor.inputValue();
    const artifacts = [];
    for (const [label, extension] of [['Markdown', 'md'], ['DOCX', 'docx'], ['HTML', 'html'], ['XML', 'xml']]) {
      const waiting = page.waitForEvent('download');
      await page.getByRole('button', { name: `Download ${label}`, exact: true }).click();
      const download = await waiting;
      expect(download.suggestedFilename()).toBe(`matrix.${extension}`);
      const path = testInfo.outputPath(`matrix.${extension}`);
      await download.saveAs(path);
      expect(await download.failure()).toBeNull();
      const bytes = await readFile(path);
      expect(bytes.length).toBeGreaterThan(0);
      if (extension === 'md') expect(bytes.equals(Buffer.from(markdown))).toBe(true);
      if (extension === 'docx') {
        expect(bytes.subarray(0, 2).toString()).toBe('PK');
        const zip = await JSZip.loadAsync(bytes);
        for (const part of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']) expect(zip.file(part)).not.toBeNull();
        const document = await zip.file('word/document.xml')!.async('string');
        const parsed = await page.evaluate((xml) => {
          const doc = new DOMParser().parseFromString(xml, 'application/xml');
          return { error: !!doc.querySelector('parsererror'), text: doc.documentElement.textContent };
        }, document);
        expect(parsed.error).toBe(false);
        expect(parsed.text).toContain(text);
      }
      if (extension === 'html' || extension === 'xml') {
        const parsed = await page.evaluate(({ source, xml }) => {
          const doc = new DOMParser().parseFromString(source, xml ? 'application/xml' : 'text/html');
          return { error: !!doc.querySelector('parsererror'), root: doc.documentElement.tagName.toLowerCase(), text: doc.querySelector(xml ? 'content' : 'body')?.textContent };
        }, { source: bytes.toString(), xml: extension === 'xml' });
        expect(parsed.error).toBe(false);
        expect(parsed.root).toBe(extension === 'xml' ? 'document' : 'html');
        expect(parsed.text).toContain(text);
      }
      artifacts.push({ filename: download.suggestedFilename(), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    await testInfo.attach('saved-artifacts', { body: JSON.stringify(artifacts, null, 2), contentType: 'application/json' });
  });
}

test('invalid XML preserves the current draft and filename; unknown tags warn and retain text', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByLabel('Markdown source');
  const filename = page.getByRole('textbox', { name: 'Filename', exact: true });
  await editor.fill('# Keep this draft');
  await filename.fill('keep-this');
  for (const [xml, message] of [['<document>', 'not well-formed XML'], ['<document><content><paragraph>partial', 'not well-formed XML'], ['<other/>', '<document><content> schema']]) {
    await page.locator('input[type="file"]').setInputFiles({ name: 'invalid.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
    await expect(page.locator('.status-line')).toContainText(message);
    await expect(editor).toHaveValue('# Keep this draft');
    await expect(filename).toHaveValue('keep-this');
  }
  await page.locator('input[type="file"]').setInputFiles({ name: 'unknown.xml', mimeType: 'application/xml', buffer: Buffer.from('<document><content><unknown>Retained text</unknown></content></document>') });
  await expect(editor).toHaveValue('Retained text\n');
  await expect(page.locator('.status-line')).toContainText('Unsupported XML tag');
});


test('documented XML example and default sample export successfully', async ({ page }, testInfo) => {
  await page.goto('/');
  const editor = page.getByLabel('Markdown source');
  await expect(editor).toHaveValue(/Garden notes/);
  for (const format of ['Markdown', 'DOCX', 'HTML', 'XML']) {
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: `Download ${format}`, exact: true }).click();
    const download = await waiting;
    const path = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(path);
    expect(await download.failure()).toBeNull();
    expect((await readFile(path)).length).toBeGreaterThan(0);
  }
  await page.locator('input[type="file"]').setInputFiles('docs/examples/document.xml');
  await expect(editor).toHaveValue(/Water the seedlings/);
  await expect(page.getByRole('heading', { name: 'Garden notes', exact: true })).toBeVisible();
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download XML', exact: true }).click();
  const download = await waiting;
  const path = testInfo.outputPath('example.xml');
  await download.saveAs(path);
  expect(await download.failure()).toBeNull();
  const xml = await readFile(path, 'utf8');
  expect(xml).toContain('<item checked="false">');
  expect(xml).toContain('https://example.com/garden');
  await page.locator('input[type="file"]').setInputFiles(path);
  await expect(editor).toHaveValue(/Water the seedlings/);
});

test('XML export remains parseable with invalid characters and imports ordinary parsererror tags', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Markdown source').fill('# **Formatted** title\n\nBad control: \u0001; emoji: 😀');
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download XML', exact: true }).click();
  const download = await waiting;
  const path = testInfo.outputPath('characters.xml');
  await download.saveAs(path);
  expect(await download.failure()).toBeNull();
  const parsed = await page.evaluate((xml) => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    return { error: doc.getElementsByTagNameNS('http://www.mozilla.org/newlayout/xml/parsererror.xml', 'parsererror').length, title: doc.querySelector('title')?.textContent, text: doc.querySelector('content')?.textContent };
  }, await readFile(path, 'utf8'));
  expect(parsed.error).toBe(0);
  expect(parsed.title).toBe('Formatted title');
  expect(parsed.text).toContain('Bad control: �; emoji: 😀');
  await page.locator('input[type="file"]').setInputFiles({ name: 'unknown.xml', mimeType: 'application/xml', buffer: Buffer.from('<document><content><parsererror>Keep text</parsererror></content></document>') });
  await expect(page.getByLabel('Markdown source')).toHaveValue('Keep text\n');
  await expect(page.locator('.status-line')).toContainText('Unsupported XML tag');
});

test('failed image DOCX export retains preceding formatted blocks and alt text', async ({ page }, testInfo) => {
  await page.route('**/broken-image.png', (route) => route.fulfill({ contentType: 'image/png', body: 'not a PNG' }));
  await page.goto('/');
  const imageURL = new URL('/broken-image.png', page.url()).href;
  await page.getByLabel('Markdown source').fill(`> Earlier quote\n\n\`\`\`text\nEarlier code\n\`\`\`\n\n| Header |\n| --- |\n| Earlier cell |\n\n![Fallback image](${imageURL})`);
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download DOCX', exact: true }).click();
  const download = await waiting;
  const path = testInfo.outputPath('fallback.docx');
  await download.saveAs(path);
  expect(await download.failure()).toBeNull();
  const zip = await JSZip.loadAsync(await readFile(path));
  const xml = await zip.file('word/document.xml')!.async('string');
  for (const text of ['Earlier quote', 'Earlier code', 'Earlier cell', 'Fallback image']) expect(xml).toContain(text);
});
