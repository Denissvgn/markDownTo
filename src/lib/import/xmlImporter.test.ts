import { describe, expect, it } from 'vitest';
import { exportToXml } from '../export/xmlExporter';
import { convertXmlToMarkdown } from './xmlImporter';
import { ImportConversionError } from './types';

describe('xmlImporter', () => {
  it('round-trips MarkdownTo XML back to readable Markdown', () => {
    const xml = exportToXml(
      `# Document Title

This is **bold** and *italic* text with \`code\`.

- [x] Done
- [ ] Pending

| Format | Status |
| --- | --- |
| DOCX | Active |
`,
      'Document Title',
      new Date('2026-05-26T21:00:00.000Z')
    );

    const result = convertXmlToMarkdown(xml);

    expect(result.markdown).toContain('# Document Title');
    expect(result.markdown).toContain('This is **bold** and *italic* text with `code`.');
    expect(result.markdown).toContain('- [x] Done');
    expect(result.markdown).toContain('- [ ] Pending');
    expect(result.markdown).toContain('| Format | Status |');
    expect(result.markdown).toContain('| DOCX | Active |');
    expect(result.warnings).toEqual([]);
  });

  it('reports unsupported XML tags and falls back to text content', () => {
    const result = convertXmlToMarkdown(`<?xml version="1.0"?>
<document>
  <content>
    <unknown>Fallback text</unknown>
  </content>
</document>`);

    expect(result.markdown).toContain('Fallback text');
    expect(result.warnings).toEqual(['Unsupported XML tag <unknown> was converted using its text content.']);
  });

  it('rejects XML outside the MarkdownTo schema', () => {
    expect(() => convertXmlToMarkdown('<root><paragraph>Text</paragraph></root>')).toThrow(ImportConversionError);
  });
});

it('retains an ordinary parsererror tag as unsupported content but rejects malformed XML', () => {
  const result = convertXmlToMarkdown('<document><content><parsererror>Keep this text</parsererror></content></document>');
  expect(result.markdown).toBe('Keep this text\n');
  expect(result.warnings).toEqual(['Unsupported XML tag <parsererror> was converted using its text content.']);
  expect(() => convertXmlToMarkdown('<document><content>')).toThrow('not well-formed XML');
});


it.each(['http://www.mozilla.org/newlayout/xml/parsererror.xml', 'http://www.w3.org/1999/xhtml'])('recognizes the parser error namespace %s', (namespace) => {
  expect(() => convertXmlToMarkdown(`<document><parsererror xmlns="${namespace}">Error</parsererror><content><paragraph>Partial</paragraph></content></document>`)).toThrow('not well-formed XML');
});
