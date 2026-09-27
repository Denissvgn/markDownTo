import type { Root } from 'mdast';
import { describe, expect, it } from 'vitest';
import { exportToHtml, mdastToHtml } from './htmlExporter';
import { exportToXml, mdastToXml } from './xmlExporter';
import { convertXmlToMarkdown } from '../import/xmlImporter';
import { parseMarkdown } from '../markdown/parser';

const date = new Date('2026-09-27T00:00:00Z');
const formats = [
  { name: 'HTML', export: (markdown: string) => exportToHtml(markdown, 'References'), parse: (value: string) => new DOMParser().parseFromString(value, 'text/html'), link: 'a', image: 'img', destination: 'href', imageDestination: 'src' },
  { name: 'XML', export: (markdown: string) => exportToXml(markdown, 'References', date), parse: (value: string) => new DOMParser().parseFromString(value, 'application/xml'), link: 'link', image: 'image', destination: 'url', imageDestination: 'url' }
];

describe.each(formats)('$name reference fidelity', (format) => {
  it.each(['full', 'collapsed', 'shortcut'])('preserves %s links and images', (kind) => {
    const link = kind === 'full' ? '[**Docs**][target]' : kind === 'collapsed' ? '[target][]' : '[target]';
    const image = kind === 'full' ? '![Logo alt][target]' : kind === 'collapsed' ? '![target][]' : '![target]';
    const document = format.parse(format.export(`${link}\n\n${image}\n\n[target]: https://example.test/path_(one)?a=1&b=%26 "A & title"`));
    expect(document.querySelector('parsererror')).toBeNull();
    expect(document.querySelector(format.link)?.getAttribute(format.destination)).toBe('https://example.test/path_(one)?a=1&b=%26');
    expect(document.querySelector(format.link)?.textContent).toBe(kind === 'full' ? 'Docs' : 'target');
    expect(document.querySelector(format.link)?.getAttribute('title')).toBe('A & title');
    expect(document.querySelector(format.image)?.getAttribute(format.imageDestination)).toBe('https://example.test/path_(one)?a=1&b=%26');
    expect(document.querySelector(format.image)?.getAttribute('alt')).toBe(kind === 'full' ? 'Logo alt' : 'target');
    expect(document.querySelector(format.image)?.getAttribute('title')).toBe('A & title');
    expect(document.querySelector('definition')).toBeNull();
  });

  it.each(['javascript:alert(1)', 'jav&#x61;script:alert(1)', 'java&#x09;script:alert(1)', 'data:image/svg+xml,unsafe', '//example.test/unexpected'])('rejects inline and resolved destinations: %s', (url) => {
    const document = format.parse(format.export(`[**Inline**](${url}) ![Inline alt](${url})\n\n[**Reference**][bad] ![Reference alt][bad]\n\n[bad]: ${url}`));
    expect(document.querySelector(`${format.link}, ${format.image}`)).toBeNull();
    for (const label of ['Inline', 'Inline alt', 'Reference', 'Reference alt']) expect(document.documentElement.textContent).toContain(label);
  });

  it('preserves unresolved syntax and applies normalized first-definition precedence inside tables', () => {
    const document = format.parse(format.export('| Link |\n| --- |\n| [Docs][MiXeD  KEY] |\n\n[Missing][absent] ![Missing][absent]\n\n[mixed key]: /first\n[MIXED KEY]: /second'));
    expect(document.querySelector(format.link)?.getAttribute(format.destination)).toBe('/first');
    expect(document.documentElement.textContent).toContain('[Missing][absent] ![Missing][absent]');
    expect(document.documentElement.textContent).not.toContain('/second');
  });
});

describe('XML round trips and serializer review cases', () => {
  it('preserves reference destinations, labels, alt text and escaped titles through XML import and HTML export', () => {
    const markdown = '[**Docs**][target]\n\n![Logo][target]\n\n[target]: https://example.test/path_(one)?a=1&b=%26 "A \\"quote\\" and \\\\ slash"';
    const original = new DOMParser().parseFromString(exportToHtml(markdown, 'Original'), 'text/html');
    const imported = convertXmlToMarkdown(exportToXml(markdown, 'Round trip', date));
    const restored = new DOMParser().parseFromString(exportToHtml(imported.markdown, 'Restored'), 'text/html');
    for (const selector of ['a', 'img']) {
      expect(restored.querySelector(selector)).not.toBeNull();
      for (const attr of ['href', 'src', 'title', 'alt']) expect(restored.querySelector(selector)?.getAttribute(attr)).toBe(original.querySelector(selector)?.getAttribute(attr));
    }
    expect(restored.querySelector('a strong')?.textContent).toBe('Docs');
  });

  it('preserves literal angle brackets and entity-looking labels, alt text, destinations and titles', () => {
    const markdown = String.raw`[\<label\> \&copy;][target]

![\<alt\> \&copy;][target]

[target]: https://example.test/?value=\&copy; "literal \&copy;"`;
    const restored = new DOMParser().parseFromString(exportToHtml(convertXmlToMarkdown(exportToXml(markdown, 'Literal', date)).markdown, 'Restored'), 'text/html');
    expect(restored.querySelector('a')?.textContent).toBe('<label> &copy;');
    expect(restored.querySelector('a')?.getAttribute('href')).toBe('https://example.test/?value=&copy;');
    expect(restored.querySelector('a')?.getAttribute('title')).toBe('literal &copy;');
    expect(restored.querySelector('img')?.getAttribute('alt')).toBe('<alt> &copy;');
    expect(restored.querySelector('label, alt, script')).toBeNull();
  });

  it('does not add indentation to code text and preserves multiline title/alt attributes', () => {
    const code = 'first\n  indented\nlast';
    const document = new DOMParser().parseFromString(exportToXml(`\`\`\`text\n${code}\n\`\`\`\n\n[Title][target]\n\n![line\nalt][target]\n\n[target]: /resource "first\nsecond"`, 'Review', date), 'application/xml');
    expect(document.querySelector('parsererror')).toBeNull();
    expect(document.querySelector('code-block')?.textContent).toBe(code);
    expect(document.querySelector('link')?.getAttribute('title')).toBe('first\nsecond');
    expect(document.querySelector('image')?.getAttribute('alt')).toBe('line\nalt');
  });

  it('retains the XML helper’s empty-input behavior', () => {
    expect(mdastToXml(null)).toBe('');
    expect(mdastToXml(undefined)).toBe('');
  });

  it('uses readable fallbacks for unresolved synthetic nodes without mutating the tree', () => {
    const root: Root = { type: 'root', children: [{ type: 'paragraph', children: [
      { type: 'linkReference', referenceType: 'full', identifier: 'missing', children: [{ type: 'strong', children: [{ type: 'text', value: 'Label' }] }] },
      { type: 'imageReference', referenceType: 'full', identifier: 'missing', alt: '<Readable alt>' }
    ] }] };
    const before = JSON.stringify(root);
    const html = new DOMParser().parseFromString(mdastToHtml(root), 'text/html');
    const xml = new DOMParser().parseFromString(`<document>${mdastToXml(root)}</document>`, 'application/xml');
    expect(html.querySelector('a, img')).toBeNull();
    expect(html.body.textContent).toBe('Label<Readable alt>\n');
    expect(xml.querySelector('link, image, Readable')).toBeNull();
    expect(xml.documentElement.textContent).toContain('Label<Readable alt>');
    expect(JSON.stringify(root)).toBe(before);
    expect(collectTypes(parseMarkdown('[missing][no]'))).not.toContain('linkReference');
  });
});

function collectTypes(node: import('mdast').Nodes): string[] {
  return [node.type, ...('children' in node ? node.children.flatMap(collectTypes) : [])];
}
