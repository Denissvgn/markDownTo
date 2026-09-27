import { describe, expect, it } from 'vitest';
import { convertEmbeddedHtmlTables, convertHtmlToMarkdown, hasConvertibleHtmlTables } from './htmlImporter';

import { parseMarkdown } from '../markdown/parser';
import { COLOR_TABLE, REVIEW_TABLE, REVIEW_DOCUMENT, LITERAL_TABLE_EXAMPLE, MARKDOWN_DOCUMENT, DIAGRAM_MACRO, CODE_MACRO, MALFORMED_DIAGRAM, MACRO_DOCUMENT } from './fixtures/syntheticTables';

describe('htmlImporter', () => {
  it('converts readable HTML structure to Markdown', () => {
    const html = `<!doctype html>
<html>
  <head><title>Ignored</title><style>body { color: red; }</style></head>
  <body>
    <h1>Document Title</h1>
    <p>This is <strong>bold</strong>, <em>italic</em>, <del>removed</del>, and <code>inline()</code>.</p>
    <blockquote><p>Quoted text</p></blockquote>
    <ul>
      <li><input type="checkbox" checked> Done</li>
      <li><input type="checkbox"> Pending</li>
    </ul>
    <ol start="3"><li>Third</li></ol>
    <pre><code class="language-ts">const value = 1;</code></pre>
    <p><a href="https://example.com" title="Example">Link</a></p>
    <p><img src="image.png" alt="Image alt" title="Image title"></p>
    <hr>
    <table>
      <thead><tr><th>Name</th><th>Status</th></tr></thead>
      <tbody><tr><td>DOCX</td><td>Active</td></tr></tbody>
    </table>
  </body>
</html>`;

    const result = convertHtmlToMarkdown(html);

    expect(result.markdown).toContain('# Document Title');
    expect(result.markdown).toContain('**bold**');
    expect(result.markdown).toContain('*italic*');
    expect(result.markdown).toContain('~~removed~~');
    expect(result.markdown).toContain('`inline()`');
    expect(result.markdown).toContain('> Quoted text');
    expect(result.markdown).toContain('-   [x]  Done');
    expect(result.markdown).toContain('-   [ ]  Pending');
    expect(result.markdown).toContain('3.  Third');
    expect(result.markdown).toContain('```ts\nconst value = 1;\n```');
    expect(result.markdown).toContain('[Link](https://example.com "Example")');
    expect(result.markdown).toContain('![Image alt](image.png "Image title")');
    expect(result.markdown).toContain('| Name | Status |');
    expect(result.markdown).toContain('| DOCX | Active |');
    expect(result.warnings).toEqual([]);
  });

  it('replaces embedded data URI images with placeholder text and a warning', () => {
    const result = convertHtmlToMarkdown('<p><img src="data:image/png;base64,abc" alt="Chart"></p>');

    expect(result.markdown).toContain('[Chart]');
    expect(result.markdown).not.toContain('data:image');
    expect(result.warnings).toEqual(['An embedded or unavailable image was replaced with placeholder text.']);
  });

  it('converts HTML tables without explicit <thead> or with colgroup into GFM pipe tables', () => {
    const html = `<table class="confluenceTable">
      <colgroup><col><col></colgroup>
      <tbody>
        <tr><th scope="row">Key</th><td>Value</td></tr>
        <tr><th scope="row">Status</th><td>Active</td></tr>
      </tbody>
    </table>`;

    const result = convertHtmlToMarkdown(html);

    expect(result.markdown).not.toContain('<table');
    expect(result.markdown).toContain('| Key | Value |');
    expect(result.markdown).toContain('| --- | --- |');
    expect(result.markdown).toContain('| Status | Active |');
  });

  it('flattens synthetic task lists and blocks inside table cells', () => {
    const result = convertHtmlToMarkdown(REVIEW_TABLE);
    expect(result.markdown).toContain('| Reviewer | State |');
    expect(result.markdown).toContain('[x] Reviewer A');
    expect(result.markdown).toContain('[ ] Reviewer B');
    expect(result.markdown).toContain('Checked \\| Recorded');
    expect(result.markdown).not.toContain('<table');
  });

  // Replaces the former conditional external-file HTML regression.
  it('converts a required synthetic review document with headings and rich tables', () => {
    expect.assertions(6);
    const result = convertHtmlToMarkdown(REVIEW_DOCUMENT);
    expect(result.markdown).toContain('# 🧩 Synthetic worksheet');
    expect(result.markdown).toContain('| Example key | Value |');
    expect(result.markdown).toContain('| SAMPLE-01 | Draft |');
    expect(result.markdown).toContain('| Reviewer | State |');
    expect(result.markdown).toContain('| Цвет | Значение |');
    expect(result.markdown).not.toContain('<table');
  });

  it('converts a Unicode table while preserving surrounding Markdown exactly', () => {
    const prefix = '# 🧩 Notes\n\n';
    const suffix = '\n\n## Kept\n- **ITEM-01:** Example';
    const result = convertEmbeddedHtmlTables(prefix + COLOR_TABLE + suffix);
    expect(result.markdown.startsWith(prefix)).toBe(true);
    expect(result.markdown.endsWith(suffix)).toBe(true);
    expect(result.markdown).toContain('| Цвет | Значение |');
    expect(result.markdown).toContain('**Синий**');
    expect(result.markdown).toContain('`blue`');
    expect(result.markdown).not.toContain('<table');
  });

  // Replaces the former conditional external-file embedded-table regression.
  it('converts every eligible synthetic Markdown table while keeping literal examples', () => {
    expect.assertions(5);
    const result = convertEmbeddedHtmlTables(MARKDOWN_DOCUMENT);
    expect(result.markdown.startsWith('# 🧩 Synthetic notes\n\n')).toBe(true);
    expect(result.markdown).toContain(LITERAL_TABLE_EXAMPLE);
    expect(parseMarkdown(result.markdown).children.filter((node) => node.type === 'table')).toHaveLength(2);
    expect(hasConvertibleHtmlTables(result.markdown)).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it('converts a synthetic diagram macro to a fenced Mermaid example', () => {
    const result = convertHtmlToMarkdown(DIAGRAM_MACRO);
    expect(result.markdown).toContain('```mermaid\nsequenceDiagram');
    expect(result.markdown).toContain('Reader->>Panel: Open example');
    expect(result.markdown).not.toContain('<table');
  });

  it('converts a synthetic code macro with its language and indentation', () => {
    const result = convertHtmlToMarkdown(CODE_MACRO);
    expect(result.markdown).toContain('```python\ndef example():\n    return "sample"\n```');
    expect(result.markdown).not.toContain('<table');
  });

  it('converts a diagram inside an ordinary table to fenced code', () => {
    const html = '<table><tr><th>sequenceDiagram\nactor Reader\nparticipant Panel\nReader-&gt;&gt;Panel: Open example</th></tr></table>';
    const result = convertHtmlToMarkdown(html);
    expect(result.markdown).toContain('```mermaid');
    expect(result.markdown).toContain('actor Reader');
    expect(result.markdown).toContain('Reader->>Panel: Open example');
    expect(result.markdown).not.toContain('| --- |');
  });

  it('repairs the required synthetic malformed diagram without removing code indentation', () => {
    const result = convertEmbeddedHtmlTables(MALFORMED_DIAGRAM);
    expect(result.markdown).toBe('```mermaid\nsequenceDiagram\n    Reader->>Panel: Open example\n```');
    expect(result.warnings).toEqual([]);
  });

  it('safely flattens deeply nested blocks without losing their text', () => {
    const html = '<table><tr><th>Header</th><td><div><p>First paragraph</p><div><p>Second paragraph</p></div></div></td></tr></table>';
    const result = convertHtmlToMarkdown(html);
    expect(result.markdown).toContain('| Header | First paragraph   Second paragraph |');
    expect(result.markdown).not.toContain('<table');
  });

  // Replaces the former conditional external-file macro/rich-HTML regression.
  it('converts a required synthetic macro and review document without external files', () => {
    expect.assertions(6);
    const result = convertHtmlToMarkdown(MACRO_DOCUMENT);
    expect(result.markdown).toContain('# Synthetic macro review');
    expect(result.markdown).toContain('Draft sample');
    expect(result.markdown).toContain('```mermaid');
    expect(result.markdown).toContain('```python');
    expect(result.markdown).toContain('Reviewer A');
    expect(result.markdown).not.toContain('<table');
  });
});
