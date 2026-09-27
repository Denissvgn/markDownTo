import { describe, expect, it } from 'vitest';
import { prepareMarkdownPaste } from './editorPaste';

const table = '<table><tr><th>A</th></tr><tr><td>B</td></tr></table>';

describe('context-aware paste', () => {
  it.each(['```html\nHERE\n```', '~~~~html\nHERE\n~~~~', 'before `HERE` after', '    HERE', '> ```html\n> HERE\n> ```', '- Example\n\n      HERE'])('keeps rich/plain table source literal inside %s', (template) => {
    const start = template.indexOf('HERE');
    const source = template.replace('HERE', '');
    const result = prepareMarkdownPaste(source, start, start, table, table);
    expect(result?.markdown).toBe(template.replace('HERE', table));
    expect(result?.converted).toBe(false);
  });

  it('preserves rich paste into empty inline and indented code', () => {
    expect(prepareMarkdownPaste('before `` after', 8, 8, 'literal cell', table)?.markdown).toBe('before `literal cell` after');
    expect(prepareMarkdownPaste('    ', 4, 4, 'literal cell', table)?.markdown).toBe('    literal cell');
  });

  it('preserves paste at the end of an unclosed fence', () => {
    const source = '```html\n';
    expect(prepareMarkdownPaste(source, source.length, source.length, table, table)?.markdown).toBe(source + table);
  });

  it('prefers Markdown code examples over a rich clipboard alternative', () => {
    const literal = `\`\`\`html\n${table}\n\`\`\``;
    expect(prepareMarkdownPaste('', 0, 0, literal, table)?.markdown).toBe(literal);
  });

  it('converts an ordinary pasted table while retaining code examples in the same clipboard', () => {
    const code = `\`\`\`html\n${table}\n\`\`\``;
    const result = prepareMarkdownPaste('', 0, 0, `${code}\n\n${table}`, '');
    expect(result?.markdown).toBe(`${code}\n\n| A |\n| --- |\n| B |`);
    expect(result?.converted).toBe(true);
  });

  it('converts only the inserted eligible table without changing an existing table', () => {
    const source = `${table}\n\n`;
    const result = prepareMarkdownPaste(source, source.length, source.length, table, '');
    expect(result?.markdown).toBe(`${source}| A |\n| --- |\n| B |`);
    expect(result?.converted).toBe(true);
    expect(result?.caret).toBe(result?.markdown.length);
  });

  it('uses the destination paragraph boundaries for plain-text paste', () => {
    const result = prepareMarkdownPaste('before after', 7, 7, table, '');
    expect(result?.markdown).toBe(`before ${table}after`);
    expect(result?.converted).toBe(false);
  });

  it('separates a rich table from surrounding prose', () => {
    const result = prepareMarkdownPaste('before after', 7, 7, 'A\nB', table);
    expect(result?.markdown).toBe('before \n\n| A |\n| --- |\n| B |\n\nafter');
    expect(result?.converted).toBe(true);
  });

  it('leaves ordinary clipboard input to native paste', () => {
    expect(prepareMarkdownPaste('', 0, 0, 'ordinary text', '<p>ordinary text</p>')).toBeNull();
  });
});
