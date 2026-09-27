import {
  escapeMarkdownTableCell,
  escapeMarkdownText,
  markdownFence,
  markdownInlineCode,
  markdownLinkDestination,
  markdownTitle,
  normalizeMarkdown
} from './markdownUtils';
import { ImportConversionError } from './types';

export interface XmlToMarkdownResult {
  markdown: string;
  warnings: string[];
}

interface XmlImportState {
  warnings: string[];
}

export function convertXmlToMarkdown(xml: string): XmlToMarkdownResult {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const parserError = document.getElementsByTagNameNS('http://www.mozilla.org/newlayout/xml/parsererror.xml', 'parsererror')[0];

  if (parserError) {
    throw new ImportConversionError('XML import failed because the file is not well-formed XML.');
  }

  const root = document.documentElement;
  const content = root?.tagName === 'document' ? directChild(root, 'content') : null;

  if (!content) {
    throw new ImportConversionError('XML import supports MarkdownTo XML files with a <document><content> schema.');
  }

  const state: XmlImportState = { warnings: [] };
  const markdown = normalizeMarkdown(elementChildren(content).map((child) => blockToMarkdown(child, state)).filter(Boolean).join('\n\n'));

  return { markdown, warnings: state.warnings };
}

function blockToMarkdown(element: Element, state: XmlImportState): string {
  switch (element.tagName) {
    case 'heading': {
      const level = clampHeadingLevel(Number(element.getAttribute('level') ?? '1'));
      return `${'#'.repeat(level)} ${inlineChildrenToMarkdown(element, state).trim()}`;
    }

    case 'paragraph':
      return inlineChildrenToMarkdown(element, state).trim();

    case 'blockquote':
      return blockChildrenToMarkdown(element, state)
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');

    case 'list':
      return listToMarkdown(element, state);

    case 'table':
      return tableToMarkdown(element, state);

    case 'code-block':
      return markdownFence(element.textContent ?? '', element.getAttribute('language') ?? '');

    case 'horizontal-rule':
      return '---';

    case 'image':
      return inlineElementToMarkdown(element, state);

    case 'break':
      return '  \n';

    default: {
      state.warnings.push(`Unsupported XML tag <${element.tagName}> was converted using its text content.`);
      return fallbackElementToMarkdown(element, state);
    }
  }
}

function inlineNodeToMarkdown(node: ChildNode, state: XmlImportState): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeMarkdownText(node.textContent ?? '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  return inlineElementToMarkdown(node as Element, state);
}

function inlineElementToMarkdown(element: Element, state: XmlImportState): string {
  switch (element.tagName) {
    case 'bold':
      return `**${inlineChildrenToMarkdown(element, state)}**`;

    case 'italic':
      return `*${inlineChildrenToMarkdown(element, state)}*`;

    case 'strike':
      return `~~${inlineChildrenToMarkdown(element, state)}~~`;

    case 'code-inline':
      return markdownInlineCode(element.textContent ?? '');

    case 'link': {
      const url = markdownLinkDestination(element.getAttribute('url') ?? '');
      return `[${inlineChildrenToMarkdown(element, state)}](${url}${markdownTitle(element.getAttribute('title'))})`;
    }

    case 'image': {
      const url = markdownLinkDestination(element.getAttribute('url') ?? '');
      const alt = escapeMarkdownText(element.getAttribute('alt') ?? '');
      return `![${alt}](${url}${markdownTitle(element.getAttribute('title'))})`;
    }

    case 'break':
      return '  \n';

    default:
      state.warnings.push(`Unsupported XML tag <${element.tagName}> was converted using its text content.`);
      return fallbackElementToMarkdown(element, state);
  }
}

function listToMarkdown(element: Element, state: XmlImportState): string {
  const ordered = element.getAttribute('type') === 'ordered';
  const start = Number(element.getAttribute('start') ?? '1');

  return elementChildren(element, 'item')
    .map((item, index) => {
      const checked = item.getAttribute('checked');
      const marker = ordered ? `${Number.isFinite(start) ? start + index : index + 1}. ` : '- ';
      const taskMarker = checked === 'true' ? '[x] ' : checked === 'false' ? '[ ] ' : '';
      const prefix = `${marker}${taskMarker}`;
      const itemMarkdown = blockChildrenToMarkdown(item, state).trim();
      const lines = itemMarkdown ? itemMarkdown.split('\n') : [''];
      const indent = ' '.repeat(prefix.length);

      return [prefix + lines[0], ...lines.slice(1).map((line) => `${indent}${line}`)].join('\n');
    })
    .join('\n');
}

function tableToMarkdown(element: Element, state: XmlImportState): string {
  const header = directChild(element, 'header');
  const body = directChild(element, 'body');
  const headerCells = header ? elementChildren(header, 'cell').map((cell) => tableCellToMarkdown(cell, state)) : [];
  const bodyRows = body ? elementChildren(body, 'row') : [];

  if (headerCells.length === 0) {
    state.warnings.push('A table without header cells was skipped during XML import.');
    return '';
  }

  const rows = bodyRows.map((row) => elementChildren(row, 'cell').map((cell) => tableCellToMarkdown(cell, state)));
  const separator = headerCells.map(() => '---');
  const markdownRows = [
    `| ${headerCells.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`)
  ];

  return markdownRows.join('\n');
}

function tableCellToMarkdown(element: Element, state: XmlImportState): string {
  return escapeMarkdownTableCell(inlineChildrenToMarkdown(element, state));
}

function blockChildrenToMarkdown(element: Element, state: XmlImportState): string {
  return Array.from(element.childNodes)
    .map((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        return child.textContent?.trim() ? escapeMarkdownText(child.textContent) : '';
      }

      if (child.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }

      return blockToMarkdown(child as Element, state);
    })
    .filter(Boolean)
    .join('\n\n');
}

function inlineChildrenToMarkdown(element: Element, state: XmlImportState): string {
  return Array.from(element.childNodes).map((child) => inlineNodeToMarkdown(child, state)).join('');
}

function fallbackElementToMarkdown(element: Element, state: XmlImportState): string {
  return element.children.length > 0 ? inlineChildrenToMarkdown(element, state).trim() : escapeMarkdownText(element.textContent ?? '').trim();
}

function elementChildren(element: Element, tagName?: string): Element[] {
  return Array.from(element.children).filter((child) => !tagName || child.tagName === tagName);
}

function directChild(element: Element, tagName: string): Element | null {
  return elementChildren(element, tagName)[0] ?? null;
}

function clampHeadingLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return 1;
  }

  return Math.min(6, Math.max(1, Math.trunc(level)));
}
