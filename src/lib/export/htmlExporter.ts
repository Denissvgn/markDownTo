import type { Nodes } from 'mdast';
import { parseMarkdown } from '../markdown/parser';
import { collectReferenceDefinitions, resolveReference } from '../markdown/references';
import { escapeHtmlAttribute, escapeHtmlText, safeDestination } from './serializationSafety';

// Preserve the existing helper export for callers needing quoted-attribute escaping.
export { escapeHtmlAttribute as escapeHtml } from './serializationSafety';

export function mdastToHtml(node: Nodes): string {
  const definitions = collectReferenceDefinitions(node);
  function render(node: Nodes): string {
    switch (node.type) {
      case 'root':
        return node.children.map(render).join('');

      case 'paragraph':
        return `<p>${node.children.map(render).join('')}</p>\n`;

      case 'heading': {
        const depth = Number.isInteger(node.depth) && node.depth >= 1 && node.depth <= 6 ? node.depth : 1;
        return `<h${depth}>${node.children.map(render).join('')}</h${depth}>\n`;
      }

      case 'text':
        return escapeHtmlText(node.value);

      case 'emphasis':
        return `<em>${node.children.map(render).join('')}</em>`;

      case 'strong':
        return `<strong>${node.children.map(render).join('')}</strong>`;

      case 'delete':
        return `<del>${node.children.map(render).join('')}</del>`;

      case 'inlineCode':
        return `<code>${escapeHtmlText(node.value)}</code>`;

      case 'code':
        return `<pre><code class="language-${escapeHtmlAttribute(node.lang ?? '')}">${escapeHtmlText(node.value)}</code></pre>\n`;

      case 'blockquote':
        return `<blockquote>\n${node.children.map(render).join('')}</blockquote>\n`;

      case 'list': {
        const tag = node.ordered ? 'ol' : 'ul';
        const startAttr = node.ordered && typeof node.start === 'number' && Number.isSafeInteger(node.start) && node.start !== 1
          ? ` start="${node.start}"`
          : '';
        return `<${tag}${startAttr}>\n${node.children.map(render).join('')}</${tag}>\n`;
      }

      case 'listItem': {
        const checkedAttr = typeof node.checked === 'boolean'
          ? `<input type="checkbox" disabled${node.checked ? ' checked' : ''} /> `
          : '';
        return `<li>${checkedAttr}${node.children.map(render).join('')}</li>\n`;
      }

      case 'table': {
        const [headRow, ...bodyRows] = node.children;
        if (!headRow) return '';

        const headHtml = `<thead>\n  <tr>\n${headRow.children.map((cell) => `    <th>${cell.children.map(render).join('')}</th>`).join('\n')}\n  </tr>\n</thead>`;
        const bodyHtml = bodyRows.length > 0
          ? `<tbody>\n${bodyRows.map((row) => `  <tr>\n${row.children.map((cell) => `    <td>${cell.children.map(render).join('')}</td>`).join('\n')}\n  </tr>`).join('\n')}\n</tbody>`
          : '';
        return `<table>\n${headHtml}\n${bodyHtml}\n</table>\n`;
      }

      case 'tableRow':
        return `<tr>\n${node.children.map(render).join('')}\n</tr>\n`;

      case 'tableCell':
        return `<td>${node.children.map(render).join('')}</td>`;

      case 'linkReference':
      case 'imageReference': {
        const resolved = resolveReference(node, definitions);
        if (resolved) return render(resolved);
        return node.type === 'imageReference' ? escapeHtmlText(node.alt ?? '') : node.children.map(render).join('');
      }

      case 'link': {
        const label = node.children.map(render).join('');
        const destination = safeDestination(node.url, 'link');
        return destination === null
          ? label
          : `<a href="${escapeHtmlAttribute(destination)}" title="${escapeHtmlAttribute(node.title ?? '')}">${label}</a>`;
      }

      case 'image': {
        const alt = node.alt ?? '';
        const destination = safeDestination(node.url, 'image');
        return destination === null
          ? escapeHtmlText(alt)
          : `<img src="${escapeHtmlAttribute(destination)}" alt="${escapeHtmlAttribute(alt)}" title="${escapeHtmlAttribute(node.title ?? '')}" />`;
      }

      case 'break':
        return '<br />';

      case 'thematicBreak':
        return '<hr />\n';

      // Raw HTML is never inserted into the exported document. Code/text nodes
      // containing HTML remain visible through the escaped cases above.
      case 'html':
      case 'definition':
        return '';

      default:
        return 'children' in node ? node.children.map(render).join('') : '';
    }
  }
  return render(node);
}

export function exportToHtml(markdown: string, title: string): string {
  const ast = parseMarkdown(markdown);
  const bodyContent = mdastToHtml(ast);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtmlText(title)}</title>
  <style>
    :root {
      --bg-color: #ffffff;
      --text-color: #1e293b;
      --link-color: #0f766e;
      --border-color: #e2e8f0;
      --code-bg: #f8fafc;
      --quote-bg: #f8fafc;
      --quote-border: #0f766e;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg-color: #0f172a;
        --text-color: #f1f5f9;
        --link-color: #14b8a6;
        --border-color: #334155;
        --code-bg: #1e293b;
        --quote-bg: #1e293b;
        --quote-border: #14b8a6;
      }
    }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: var(--text-color);
      background-color: var(--bg-color);
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }
    h1, h2, h3, h4, h5, h6 {
      font-weight: 700;
      line-height: 1.25;
      margin-top: 2rem;
      margin-bottom: 1rem;
    }
    h1 { font-size: 2.25rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3rem; }
    h2 { font-size: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3rem; }
    h3 { font-size: 1.25rem; }
    p { margin-top: 0; margin-bottom: 1rem; }
    a { color: var(--link-color); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace; font-size: 0.85em; background-color: var(--code-bg); padding: 0.2rem 0.4rem; border-radius: 0.25rem; }
    pre { background-color: var(--code-bg); padding: 1rem; border-radius: 0.375rem; overflow-x: auto; border: 1px solid var(--border-color); }
    pre code { background-color: transparent; padding: 0; border-radius: 0; }
    blockquote { margin: 1.5rem 0; padding: 0.5rem 1rem; border-left: 4px solid var(--quote-border); background-color: var(--quote-bg); color: var(--text-color); opacity: 0.95; }
    table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; }
    th, td { border: 1px solid var(--border-color); padding: 0.75rem; text-align: left; }
    th { background-color: var(--code-bg); font-weight: 600; }
    ul, ol { margin-top: 0; margin-bottom: 1rem; padding-left: 2rem; }
    li { margin-bottom: 0.25rem; }
    hr { height: 1px; border: 0; border-top: 1px solid var(--border-color); margin: 2rem 0; }
    img { max-width: 100%; height: auto; display: block; margin: 1.5rem 0; border-radius: 0.375rem; }
    input[type="checkbox"] { margin-right: 0.5em; vertical-align: middle; }
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
}
