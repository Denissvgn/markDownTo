import { describe, expect, it, vi } from 'vitest';
import { convertEmbeddedHtmlTables, hasConvertibleHtmlTables } from './htmlImporter';
import { parseMarkdown } from '../markdown/parser';

const table = '<table><tr><th>Key</th></tr><tr><td>Value</td></tr></table>';
const diagram = '|\nsequenceDiagram\n    A->>B: Message\n\n |\n| --- |';

describe('source-aware table conversion', () => {
  it.each([
    `\`\`\`html\n${table}\n\`\`\``,
    `~~~~html\n${table}\n~~~~`,
    `\`\`\`\`html\n\`\`\`\n${table}\n\`\`\`\n\`\`\`\``,
    `    ${table}`, `\t${table}`,
    `before \`${table}\` after`,
    `> \`\`\`html\n> ${table}\n> \`\`\``,
    `- Example\n\n      ${table}`,
    `\\<table>literal</table>`,
    `\`\`\`text\n${diagram}\n\`\`\``,
    `\`${diagram}\``,
    `> ${diagram.replaceAll('\n', '\n> ')}`
  ])('preserves literal source exactly: %s', (source) => {
    expect(convertEmbeddedHtmlTables(source).markdown).toBe(source);
    expect(hasConvertibleHtmlTables(source)).toBe(false);
  });

  it.each(['\n', '\r\n'])('replaces only eligible spans with %j line endings', (newline) => {
    const prefix = `# Untouched  \n\n\`\`\`html\n${table}\n\`\`\`\n\n`.replaceAll('\n', newline);
    const suffix = '\n\nAfter  \n\n\n'.replaceAll('\n', newline);
    const input = `${prefix}${table.replace('<tr>', `<tr>${newline}`)}${suffix}`;
    const result = convertEmbeddedHtmlTables(input);
    expect(result.markdown.startsWith(prefix)).toBe(true);
    expect(result.markdown.endsWith(suffix)).toBe(true);
    expect(result.markdown).toContain(['| Key |', '| --- |', '| Value |'].join(newline));
    expect(convertEmbeddedHtmlTables(result.markdown).markdown).toBe(result.markdown);
    expect(result.warnings).toEqual([]);
  });

  it('keeps adjacent table conversions separate and ignores closing text inside quoted attributes/comments', () => {
    const first = table.replace('<table>', '<table title="</table>"><!-- </table> -->');
    const converted = convertEmbeddedHtmlTables(first + '\n' + table).markdown;
    expect(parseMarkdown(converted).children.filter((node) => node.type === 'table')).toHaveLength(2);
    expect(convertEmbeddedHtmlTables(converted).markdown).toBe(converted);
  });

  it('repairs a plain malformed diagram but preserves its indentation', () => {
    const result = convertEmbeddedHtmlTables(diagram);
    expect(result.markdown).toBe('```mermaid\nsequenceDiagram\n    A->>B: Message\n```');
    expect(hasConvertibleHtmlTables(diagram)).toBe(true);
    expect(convertEmbeddedHtmlTables(result.markdown).markdown).toBe(result.markdown);
  });

  it.each([
    '<table><tr><td>Unclosed',
    `<table><tr><td>${table}</td></tr></table>`,
    '<table><script>"</table>"</script><tr><td>Value</td></tr></table>',
    '<table title="unfinished><tr><td>Value</td></tr></table>',
    `<div>${table}</div>`, '<table></table>', `<table>stray text<tr><td>Cell</td></tr></table>`, `> ${table}`
  ])('preserves ambiguous HTML with feedback: %s', (source) => {
    const result = convertEmbeddedHtmlTables(source);
    expect(result.markdown).toBe(source);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(hasConvertibleHtmlTables(source)).toBe(false);
  });


  it('uses surrounding CRLF for a single-line table and preserves the rest exactly', () => {
    const result = convertEmbeddedHtmlTables(`# Before\r\n\r\n${table}\r\n\r\nAfter`);
    expect(result.markdown).toBe('# Before\r\n\r\n| Key |\r\n| --- |\r\n| Value |\r\n\r\nAfter');
  });

  it('retains failed ranges and all subsequent surrounding text', () => {
    const spy = vi.spyOn(DOMParser.prototype, 'parseFromString').mockImplementation(() => { throw new Error('Synthetic conversion failure'); });
    try {
      const result = convertEmbeddedHtmlTables(`# Before\n\n${table}\n\nAfter`);
      expect(result.markdown).toBe(`# Before\n\n${table}\n\nAfter`);
      expect(result.warnings).toEqual(['An HTML table could not be converted and was left unchanged.']);
    } finally { spy.mockRestore(); }
  });
});
