import { describe, expect, it } from 'vitest';
import { extractDocumentTitle, parseMarkdown, slugifyFilename } from './parser';

describe('parseMarkdown', () => {
  it('parses headings, emphasis, links, and code blocks', () => {
    const tree = parseMarkdown(`# Title

Paragraph with **bold** and [link](https://example.com).

\`\`\`ts
const value = 1;
\`\`\`
`);

    expect(tree.children[0]).toMatchObject({ type: 'heading', depth: 1 });
    expect(tree.children[1]).toMatchObject({ type: 'paragraph' });
    expect(tree.children[2]).toMatchObject({ type: 'code', lang: 'ts' });
  });

  it('parses GFM tables and task lists', () => {
    const tree = parseMarkdown(`| Format | Status |
| --- | --- |
| DOCX | Active |

- [x] Preview
- [ ] PDF later
`);

    expect(tree.children.some((node) => node.type === 'table')).toBe(true);

    const list = tree.children.find((node) => node.type === 'list');
    expect(list).toMatchObject({
      type: 'list',
      children: [
        { type: 'listItem', checked: true },
        { type: 'listItem', checked: false }
      ]
    });
  });

  it('returns a tree for malformed markdown', () => {
    const tree = parseMarkdown('**unfinished emphasis');

    expect(tree.type).toBe('root');
    expect(tree.children.length).toBeGreaterThan(0);
  });
});

describe('document helpers', () => {
  it('extracts the first H1 as a title', () => {
    expect(extractDocumentTitle('# Export Plan\n\nBody')).toBe('Export Plan');
  });

  it('slugifies filenames safely', () => {
    expect(slugifyFilename('Q2 Export Plan.docx')).toBe('q2-export-plan-docx');
    expect(slugifyFilename('')).toBe('markdown-document');
  });
});
