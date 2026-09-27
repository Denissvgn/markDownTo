import { describe, expect, it } from 'vitest';
import type { Heading, List } from 'mdast';
import { exportToHtml, mdastToHtml } from './htmlExporter';
import { convertHtmlToMarkdown } from '../import/htmlImporter';
import { convertXmlToMarkdown } from '../import/xmlImporter';

describe('htmlExporter', () => {
  it('converts basic markdown structure to HTML', () => {
    const markdown = `# Document Title

This is a paragraph with **bold** and *italic* text.

- Item 1
- Item 2

| Col 1 | Col 2 |
| --- | --- |
| Val 1 | Val 2 |
`;
    const title = 'Document Title';
    const html = exportToHtml(markdown, title);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Document Title</title>');
    expect(html).toContain('<h1>Document Title</h1>');
    expect(html).toContain('<p>This is a paragraph with <strong>bold</strong> and <em>italic</em> text.</p>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li><p>Item 1</p>');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>Col 1</th>');
    expect(html).toContain('<td>Val 1</td>');
  });
});

const unsafeDestinations = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'jav&#x61;script:alert(1)',
  'javascript&colon;alert(1)',
  'java&#x09;script:alert(1)',
  'java&#x0a;script:alert(1)',
  'java%73cript:alert(1)',
  'vbscript:msgbox(1)',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'file:///tmp/unsafe.html',
  '//example.test/unexpected'
];

describe('HTML export safety', () => {
  it.each(unsafeDestinations)('keeps link and image destinations inert: %s', (destination) => {
    const html = exportToHtml(`[**readable label**](${destination})\n\n![readable alt](${destination})`, 'Safe');
    const document = new DOMParser().parseFromString(html, 'text/html');
    expect(document.querySelector('a, img, script, svg')).toBeNull();
    expect(document.body.textContent).toContain('readable label');
    expect(document.body.textContent).toContain('readable alt');
    expect(document.querySelector('strong')?.textContent).toBe('readable label');
  });

  it.each(['x"><svg/onload=globalThis.__probe=1>', 'x"><img/src=x/onerror=globalThis.__probe=2>'])('escapes malicious code-fence languages: %s', (language) => {
      const document = new DOMParser().parseFromString(exportToHtml(`\`\`\`${language}\n<literal> & code\n\`\`\``, 'Safe'), 'text/html');
      expect(document.querySelector('pre code')?.getAttribute('class')).toBe(`language-${language}`);
      expect(document.querySelector('pre code')?.textContent).toBe('<literal> & code');
      expect(document.querySelector('svg, img, script, literal')).toBeNull();
    });

  it('keeps a malicious document title literal', () => {
    const title = '</title><svg onload="globalThis.__probe=1"> & text';
    const document = new DOMParser().parseFromString(exportToHtml('# Safe', title), 'text/html');
    expect(document.title).toBe(title);
    expect(document.querySelector('svg, script')).toBeNull();
  });

  it('keeps raw HTML inert while displaying literal code', () => {
    const markdown = '<script>globalThis.__probe=1</script>\n\n<svg onload="globalThis.__probe=2"></svg>\n\n`<img src=x onerror=alert(1)>`';
    const document = new DOMParser().parseFromString(exportToHtml(markdown, 'Safe'), 'text/html');
    expect(document.querySelector('svg, script, img')).toBeNull();
    expect(document.querySelector('code')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('preserves safe links, queries, relative paths, fragments, images, and formatting', () => {
    const markdown = `# Safe formats

[Web](https://example.test/docs?a=1&b=%26 "A & B")

[Mail](mailto:reader@example.test) [Local](../docs/page.html) [Section](#safe-formats)

![Logo](https://example.test/logo.png "Image title")

3. numbered

- [x] complete

> ~~changed~~ and **bold**

| Column |
| --- |
| Value |
`;
    const document = new DOMParser().parseFromString(exportToHtml(markdown, 'Safe'), 'text/html');
    expect(Array.from(document.querySelectorAll('a'), (link) => link.getAttribute('href'))).toEqual([
      'https://example.test/docs?a=1&b=%26', 'mailto:reader@example.test', '../docs/page.html', '#safe-formats'
    ]);
    expect(document.querySelector('a')?.title).toBe('A & B');
    expect(document.querySelector('img')?.getAttribute('src')).toBe('https://example.test/logo.png');
    expect(document.querySelector('img')?.alt).toBe('Logo');
    expect(document.querySelector('img')?.title).toBe('Image title');
    expect(document.querySelector('ol')?.getAttribute('start')).toBe('3');
    expect(document.querySelector('input')?.checked).toBe(true);
    expect(document.querySelector('input')?.disabled).toBe(true);
    expect(document.querySelector('blockquote del')?.textContent).toBe('changed');
    expect(document.querySelector('table td')?.textContent).toBe('Value');
  });
});


describe('HTML serialization review regressions', () => {
  it('quotes link and image metadata without adding attributes', () => {
    const value = `" onload="alert(1)" '><svg/onload=alert(2)> &quot;`;
    const url = 'https://example.test/?q="&next=%26';
    const html = mdastToHtml({ type: 'root', children: [
      { type: 'paragraph', children: [
        { type: 'link', url, title: value, children: [{ type: 'text', value: 'Safe link' }] },
        { type: 'image', url, title: value, alt: value }
      ] }
    ] });
    const document = new DOMParser().parseFromString(html, 'text/html');
    expect(document.querySelector('a')?.getAttributeNames()).toEqual(['href', 'title']);
    expect(document.querySelector('a')?.getAttribute('href')).toBe(url);
    expect(document.querySelector('a')?.getAttribute('title')).toBe(value);
    expect(document.querySelector('img')?.getAttributeNames()).toEqual(['src', 'alt', 'title']);
    expect(document.querySelector('img')?.getAttribute('alt')).toBe(value);
    expect(document.querySelector('img')?.getAttribute('title')).toBe(value);
    expect(document.querySelector('svg, script')).toBeNull();
  });

  it('validates heading and ordered-list metadata before inserting it', () => {
    const injected = '1><svg/onload=alert(1)>';
    const heading: Heading = { type: 'heading', depth: injected as unknown as Heading['depth'], children: [{ type: 'text', value: 'Heading' }] };
    const list: List = { type: 'list', ordered: true, start: injected as unknown as number, children: [] };
    const document = new DOMParser().parseFromString(mdastToHtml(heading) + mdastToHtml(list), 'text/html');
    expect(document.querySelector('h1')?.textContent).toBe('Heading');
    expect(document.querySelector('ol')?.hasAttribute('start')).toBe(false);
    expect(document.querySelector('svg, script')).toBeNull();
  });

  it('also rejects destinations decoded from HTML and custom XML imports', () => {
    const inputs = [
      convertHtmlToMarkdown('<p><a href="jav&#x61;script:alert(1)">Imported link</a></p><img src="javascript:alert(2)" alt="Imported image">').markdown,
      convertXmlToMarkdown('<document><content><paragraph><link url="jav&#x61;script:alert(1)">Imported link</link></paragraph><image url="javascript:alert(2)" alt="Imported image" /></content></document>').markdown
    ];
    for (const markdown of inputs) {
      const document = new DOMParser().parseFromString(exportToHtml(markdown, 'Imported'), 'text/html');
      expect(document.querySelector('a, img')).toBeNull();
      expect(document.body.textContent).toContain('Imported link');
      expect(document.body.textContent).toContain('Imported image');
    }
  });
});
