import type { Root } from 'mdast';
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

  const title = heading.children
    .map((node) => ('value' in node && typeof node.value === 'string' ? node.value : ''))
    .join('')
    .trim();

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
