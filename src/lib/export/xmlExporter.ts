import type { Nodes } from 'mdast';
import { parseMarkdown } from '../markdown/parser';
import { collectReferenceDefinitions, resolveReference } from '../markdown/references';
import { safeDestination } from './serializationSafety';

export function mdastToXml(node: Nodes | null | undefined): string {
  if (!node) return '';
  const definitions = collectReferenceDefinitions(node);
  function render(node: Nodes): string {
    switch (node.type) {
      case 'root':
        return node.children.map(render).join('');
      case 'paragraph':
        return `<paragraph>${node.children.map(render).join('')}</paragraph>\n`;
      case 'heading': {
        const level = Number.isInteger(node.depth) && node.depth >= 1 && node.depth <= 6 ? node.depth : 1;
        return `<heading level="${level}">${node.children.map(render).join('')}</heading>\n`;
      }
      case 'text':
        return escapeXml(node.value);
      case 'emphasis':
        return `<italic>${node.children.map(render).join('')}</italic>`;
      case 'strong':
        return `<bold>${node.children.map(render).join('')}</bold>`;
      case 'delete':
        return `<strike>${node.children.map(render).join('')}</strike>`;
      case 'inlineCode':
        return `<code-inline>${escapeXml(node.value)}</code-inline>`;
      case 'code':
        return `<code-block${attribute('language', node.lang)}>${escapeXml(node.value)}</code-block>\n`;
      case 'blockquote':
        return `<blockquote>\n${node.children.map(render).join('')}</blockquote>\n`;
      case 'list': {
        const start = node.ordered && typeof node.start === 'number' && Number.isSafeInteger(node.start) && node.start !== 1
          ? ` start="${node.start}"` : '';
        return `<list type="${node.ordered ? 'ordered' : 'unordered'}"${start}>\n${node.children.map(render).join('')}</list>\n`;
      }
      case 'listItem': {
        const checked = typeof node.checked === 'boolean' ? ` checked="${node.checked}"` : '';
        return `<item${checked}>${node.children.map(render).join('')}</item>\n`;
      }
      case 'table': {
        const [head, ...rows] = node.children;
        if (!head) return '';
        const header = `  <header>\n${head.children.map((cell) => `    <cell>${cell.children.map(render).join('')}</cell>`).join('\n')}\n  </header>\n`;
        const body = rows.length > 0
          ? `  <body>\n${rows.map((row) => `    <row>\n${row.children.map((cell) => `      <cell>${cell.children.map(render).join('')}</cell>`).join('\n')}\n    </row>`).join('\n')}\n  </body>\n`
          : '';
        return `<table>\n${header}${body}</table>\n`;
      }
      case 'linkReference':
      case 'imageReference': {
        const resolved = resolveReference(node, definitions);
        if (resolved) return render(resolved);
        return node.type === 'imageReference' ? escapeXml(node.alt ?? '') : node.children.map(render).join('');
      }
      case 'link': {
        const label = node.children.map(render).join('');
        const url = safeDestination(node.url, 'link');
        return url === null ? label : `<link${attribute('url', url)}${attribute('title', node.title)}>${label}</link>`;
      }
      case 'image': {
        const url = safeDestination(node.url, 'image');
        return url === null ? escapeXml(node.alt ?? '') : `<image${attribute('url', url)}${attribute('alt', node.alt)}${attribute('title', node.title)} />`;
      }
      case 'break':
        return '<break />';
      case 'thematicBreak':
        return '<horizontal-rule />\n';
      case 'html':
      case 'definition':
        return '';
      default:
        return 'children' in node ? node.children.map(render).join('') : '';
    }
  }
  return render(node);
}

export function escapeXml(text: string): string {
  // XML 1.0 excludes most controls, lone surrogates and U+FFFE/U+FFFF.
  // Replace invalid characters visibly rather than emit an unparseable file.
  const validText = Array.from(text, (character) => {
    const point = character.codePointAt(0)!;
    return point === 9 || point === 10 || point === 13 ||
      (point >= 0x20 && point <= 0xd7ff) || (point >= 0xe000 && point <= 0xfffd) ||
      (point >= 0x10000 && point <= 0x10ffff) ? character : '\uFFFD';
  }).join('');
  return validText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function attribute(name: 'url' | 'title' | 'alt' | 'language', value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  // Character references preserve whitespace that XML attribute normalization
  // would otherwise replace, including multiline Markdown titles/alt text.
  const escaped = escapeXml(value).replace(/\r/g, '&#13;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');
  return ` ${name}="${escaped}"`;
}

export function exportToXml(markdown: string, title: string, generatedAt: Date): string {
  const content = mdastToXml(parseMarkdown(markdown));
  // Do not indent serialized lines: that would insert spaces inside code/text.
  return `<?xml version="1.0" encoding="UTF-8"?>
<document>
  <metadata>
    <title>${escapeXml(title)}</title>
    <generated-at>${generatedAt.toISOString()}</generated-at>
  </metadata>
  <content>
${content}  </content>
</document>`;
}
