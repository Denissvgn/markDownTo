import type { Nodes, Root } from 'mdast';
import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';

const processor = unified().use(remarkParse).use(remarkGfm);

export function parseMarkdown(markdown: string): Root {
  const tree = processor.parse(markdown);
  return processor.runSync(tree) as Root;
}

export function extractDocumentTitle(markdown: string, fallback = 'Markdown Document'): string {
  const tree = parseMarkdown(markdown);
  const heading = tree.children.find((node) => node.type === 'heading' && node.depth === 1);

  if (!heading || !('children' in heading)) {
    return fallback;
  }

  function text(node: Nodes): string {
    if (node.type === 'text' || node.type === 'inlineCode') return node.value;
    if (node.type === 'image' || node.type === 'imageReference') return node.alt ?? '';
    return 'children' in node ? node.children.map(text).join('') : '';
  }
  const title = heading.children.map(text).join('').trim();

  return title || fallback;
}

export function slugifyFilename(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'markdown-document';
}
