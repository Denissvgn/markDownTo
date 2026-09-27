import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { ImportConversionError } from './types';
import { escapeMarkdownText, markdownFence, markdownLinkDestination, markdownTitle, normalizeMarkdown } from './markdownUtils';
import { planEmbeddedTableConversions } from './embeddedTables';
export { hasConvertibleHtmlTables } from './embeddedTables';

interface HtmlToMarkdownOptions {
  embeddedImageSrcPrefix?: string;
  allowDataUriImages?: boolean;
  warnForImagePlaceholders?: boolean;
}

export interface HtmlToMarkdownResult {
  markdown: string;
  warnings: string[];
}

const REMOVED_SELECTORS = [
  'script',
  'style',
  'template',
  'noscript',
  'meta',
  'link',
  'title',
  'svg',
  '[hidden]'
].join(',');

export function convertHtmlToMarkdown(html: string, options: HtmlToMarkdownOptions = {}): HtmlToMarkdownResult {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const body = document.body;

  if (!body) {
    throw new ImportConversionError('HTML import failed because the file could not be parsed.');
  }

  body.querySelectorAll(REMOVED_SELECTORS).forEach((node) => node.remove());
  body.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
  normalizeTables(body);

  const warnings: string[] = [];
  const turndown = createTurndownService(warnings, options);
  const markdown = normalizeMarkdown(turndown.turndown(body));

  return { markdown, warnings };
}

export function convertEmbeddedHtmlTables(text: string, options: HtmlToMarkdownOptions = {}, sourceRange?: { start: number; end: number }): HtmlToMarkdownResult {
  const plan = planEmbeddedTableConversions(text);
  const warnings = sourceRange ? planEmbeddedTableConversions(text.slice(sourceRange.start, sourceRange.end)).warnings : [...plan.warnings];
  const pieces: string[] = [];
  const defaultNewline = text.match(/\r?\n/)?.[0] ?? '\n';
  let cursor = 0;
  for (const range of plan.ranges) {
    if (sourceRange && (range.start < sourceRange.start || range.end > sourceRange.end)) continue;
    const original = text.slice(range.start, range.end);
    const newline = original.match(/\r?\n/)?.[0] ?? defaultNewline;
    let converted: string;
    try {
      if (range.kind === 'diagram') {
        converted = markdownFence((range.body ?? '').replace(/\r\n/g, '\n').replace(/\n+$/, ''), 'mermaid');
      } else {
        const result = convertHtmlToMarkdown(original, options);
        warnings.push(...result.warnings);
        converted = result.markdown.trim();
        if (!converted) { warnings.push('An empty HTML table was left unchanged.'); continue; }
      }
      converted = converted.replace(/\r?\n/g, newline);
    } catch {
      warnings.push('An HTML table could not be converted and was left unchanged.');
      continue;
    }
    // Keep surrounding source slices exact; separators belong to the replaced
    // block and prevent adjacent converted tables from merging into one table.
    const before = text.slice(cursor, range.start);
    const after = text.slice(range.end);
    const prefix = before && !/(?:^|\n)[ \t]*$/.test(before) ? newline + newline : '';
    const suffix = after && !/^(?:[ \t]*\r?\n){2}/.test(after) ? newline + newline : '';
    pieces.push(text.slice(cursor, range.start), prefix + converted + suffix);
    cursor = range.end;
  }
  pieces.push(text.slice(cursor));
  return { markdown: pieces.join(''), warnings: [...new Set(warnings)] };
}

function createTurndownService(warnings: string[], options: HtmlToMarkdownOptions): TurndownService {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    br: '  ',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined'
  });

  turndown.use(gfm);

  turndown.addRule('escapeTableCellPipes', {
    filter: ['th', 'td'],
    replacement(content, node) {
      const sanitized = content
        .replace(/[\r\n]+/g, ' ')
        .trim()
        .replace(/(?<!\\)\|/g, '\\|')
        .replace(/\\\[([ xX]?)\\\]/g, '[$1]');
      const index = Array.prototype.indexOf.call(node.parentNode?.childNodes ?? [], node);
      const prefix = index === 0 ? '| ' : ' ';
      return `${prefix}${sanitized} |`;
    }
  });

  turndown.addRule('doubleTildeStrikethrough', {
    filter(node) {
      return ['DEL', 'S', 'STRIKE'].includes(node.nodeName);
    },
    replacement(content) {
      return content.trim() ? `~~${content}~~` : '';
    }
  });
  turndown.addRule('markdownToImage', {
    filter: 'img',
    replacement(_content, node) {
      const src = node.getAttribute('src')?.trim() ?? '';
      const alt = node.getAttribute('alt') ?? '';
      const title = node.getAttribute('title');
      const isPlaceholder = Boolean(options.embeddedImageSrcPrefix && src.startsWith(options.embeddedImageSrcPrefix));
      const isDataUri = src.toLowerCase().startsWith('data:');

      if (!src || isPlaceholder || (isDataUri && options.allowDataUriImages !== true)) {
        if (options.warnForImagePlaceholders !== false) {
          warnings.push('An embedded or unavailable image was replaced with placeholder text.');
        }

        return alt ? `[${escapeMarkdownText(alt)}]` : '[Embedded image omitted]';
      }

      return `![${escapeMarkdownText(alt)}](${markdownLinkDestination(src)}${markdownTitle(title)})`;
    }
  });

  return turndown;
}

const MERMAID_KEYWORDS_REGEX = /^\s*(sequenceDiagram|flowchart|graph\s+(TD|LR|TB|BT|RL)|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|gitGraph|mindmap|quadrantChart|timeline|zenuml|sankey(-beta)?|xychart(-beta)?|block(-beta)?|kanban|architecture(-beta)?)\b/i;

function normalizeTables(root: HTMLElement): void {
  root.querySelectorAll('table').forEach((table) => {
    // 0. Handle Confluence macro tables or tables containing diagrams/code blocks
    const macroName = (table.getAttribute('data-macro-name') ?? '').toLowerCase().trim();
    const isWysiwygMacro = table.classList.contains('wysiwyg-macro') || Boolean(macroName);

    const bodyCell = table.querySelector('.wysiwyg-macro-body') ?? table;
    const rawText = (bodyCell.querySelector('pre, code')?.textContent ?? bodyCell.textContent ?? '').trim();

    if (isWysiwygMacro || MERMAID_KEYWORDS_REGEX.test(rawText)) {
      const macroParams = table.getAttribute('data-macro-parameters') ?? '';
      let language = 'mermaid';

      if (MERMAID_KEYWORDS_REGEX.test(rawText)) {
        language = 'mermaid';
      } else if (macroName === 'mermaiddiagram') {
        language = 'mermaid';
      } else if (macroName === 'code') {
        const match = macroParams.match(/language=([a-z0-9_-]+)/i);
        language = match ? match[1].toLowerCase() : '';
      } else if (macroName === 'noformat') {
        language = '';
      } else if (macroName) {
        language = macroName;
      }

      const formattedContent = rawText
        .split(/[\r\n]+/)
        .map((line) => line.trimEnd())
        .join('\n');

      const pre = root.ownerDocument.createElement('pre');
      const code = root.ownerDocument.createElement('code');
      if (language) {
        code.className = `language-${language}`;
      }
      code.textContent = formattedContent;
      pre.appendChild(code);

      table.replaceWith(pre);
      return;
    }

    // 1. Remove non-semantic layout elements
    table.querySelectorAll('colgroup, col').forEach((node) => node.remove());

    // 2. Normalize cells inside table (flatten lists, blocks, remove newlines)
    table.querySelectorAll('th, td').forEach((cell) => {
      // Flatten lists inside table cells
      cell.querySelectorAll('ul, ol').forEach((list) => {
        const isTaskList = list.classList.contains('inline-task-list') || list.getAttribute('data-task-list') === 'true';
        const items = Array.from(list.querySelectorAll('li')).map((li) => {
          const isChecked = li.classList.contains('checked') || Boolean(li.querySelector('input[checked]'));
          const isTask = isTaskList || li.classList.contains('checked') || li.hasAttribute('data-inline-task-id') || Boolean(li.querySelector('input[type="checkbox"]'));
          const prefix = isTask ? (isChecked ? '[x] ' : '[ ] ') : '';
          const text = li.textContent?.trim() ?? '';
          return prefix ? `${prefix}${text}` : text;
        }).filter(Boolean);

        const listContainer = root.ownerDocument.createElement('span');
        items.forEach((itemText, idx) => {
          if (idx > 0) {
            listContainer.appendChild(root.ownerDocument.createElement('br'));
          }
          listContainer.appendChild(root.ownerDocument.createTextNode(itemText));
        });

        list.replaceWith(listContainer);
      });

      // Flatten block tags (p, div, h1..h6, blockquote)
      cell.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, blockquote').forEach((block) => {
        if (!cell.contains(block)) {
          return;
        }

        const parent = block.parentNode;
        if (!parent) {
          return;
        }

        if (block.previousSibling && block.previousSibling.nodeName !== 'BR') {
          parent.insertBefore(root.ownerDocument.createElement('br'), block);
        }

        const fragment = root.ownerDocument.createDocumentFragment();
        while (block.firstChild) {
          fragment.appendChild(block.firstChild);
        }
        block.replaceWith(fragment);
      });

      // Clean up raw newlines inside text nodes of table cells
      const walker = root.ownerDocument.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      let textNode: Text | null;
      while ((textNode = walker.nextNode() as Text | null)) {
        if (textNode.nodeValue) {
          textNode.nodeValue = textNode.nodeValue.replace(/[\r\n]+/g, ' ');
        }
      }
    });

    // 3. Ensure proper <thead> header structure
    let thead = table.querySelector('thead');
    if (!thead) {
      thead = root.ownerDocument.createElement('thead');
      const firstRow = table.querySelector('tr');
      if (firstRow) {
        const newHeaderRow = root.ownerDocument.createElement('tr');
        Array.from(firstRow.children).forEach((cell) => {
          const th = root.ownerDocument.createElement('th');
          Array.from(cell.attributes).forEach((attr) => th.setAttribute(attr.name, attr.value));
          while (cell.firstChild) {
            th.appendChild(cell.firstChild);
          }
          newHeaderRow.appendChild(th);
        });
        thead.appendChild(newHeaderRow);
        firstRow.remove();
        table.insertBefore(thead, table.firstChild);
      }
    } else {
      // Ensure all top cells in thead are th elements
      thead.querySelectorAll('tr').forEach((row) => {
        Array.from(row.children).forEach((cell) => {
          if (cell.tagName === 'TD') {
            const th = root.ownerDocument.createElement('th');
            Array.from(cell.attributes).forEach((attr) => th.setAttribute(attr.name, attr.value));
            while (cell.firstChild) {
              th.appendChild(cell.firstChild);
            }
            cell.replaceWith(th);
          }
        });
      });
    }
  });
}
