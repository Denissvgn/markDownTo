import type { Nodes } from 'mdast';
import { parseMarkdown } from '../markdown/parser';

export interface TableConversionRange {
  start: number;
  end: number;
  kind: 'html' | 'diagram';
  body?: string;
}

export interface TableConversionPlan {
  ranges: TableConversionRange[];
  warnings: string[];
}

const DIAGRAM_KEYWORDS = '(?:sequenceDiagram|flowchart|graph[ \\t]+[A-Za-z]+|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|gitGraph|mindmap|quadrantChart|timeline|zenuml|sankey(?:-beta)?|xychart(?:-beta)?|block(?:-beta)?|kanban|architecture(?:-beta)?)';
const HTML_TOKEN = /<!--[^]*?-->|<\/?([a-z][a-z\d:-]*)\b(?:[^<>"']|"[^"]*"|'[^']*')*>/iy;
const AMBIGUOUS = 'An incomplete, nested, or ambiguous HTML table was left unchanged.';

// Locate a complete outer table without mistaking quoted attributes/comments
// for tags. Raw-text elements and nested tables are deliberately not guessed.
function tableEnd(source: string, start: number): number | null {
  let cursor = start;
  let opened = false;
  while (cursor < source.length) {
    const next = source.indexOf('<', cursor);
    if (next < 0) return null;
    HTML_TOKEN.lastIndex = next;
    const token = HTML_TOKEN.exec(source);
    if (!token) return null;
    cursor = HTML_TOKEN.lastIndex;
    if (!token[1]) continue;
    const name = token[1].toLowerCase();
    if (/^(script|style|textarea|title|xmp|plaintext)$/.test(name)) return null;
    if (name !== 'table') continue;
    const closing = token[0].startsWith('</');
    if (closing) return opened ? cursor : null;
    if (opened || /\/\s*>$/.test(token[0])) return null;
    opened = true;
  }
  return null;
}

function onlyPlainDiagramNodes(node: Nodes): boolean {
  return ['paragraph', 'text', 'table', 'tableRow', 'tableCell'].includes(node.type)
    && (!('children' in node) || node.children.every(onlyPlainDiagramNodes));
}

export function planEmbeddedTableConversions(source: string): TableConversionPlan {
  const root = parseMarkdown(source);
  const ranges: TableConversionRange[] = [];
  const warnings: string[] = [];
  for (const node of root.children) {
    if (node.type !== 'html') {
      const inspect = (child: Nodes): void => {
        if (child.type === 'html' && /<table\b/i.test(child.value)) warnings.push('A non-standalone HTML table was left unchanged.');
        if ('children' in child) child.children.forEach(inspect);
      };
      if ('children' in node) node.children.forEach(inspect);
      continue;
    }
    if (node.position?.start.offset === undefined || node.position.end.offset === undefined) continue;
    const start = node.position.start.offset;
    const block = source.slice(start, node.position.end.offset);
    if (!/^ {0,3}<table\b/i.test(block)) {
      if (/<table\b/i.test(block)) warnings.push('A non-standalone HTML table was left unchanged.');
      continue;
    }
    let cursor = 0;
    while (cursor < block.length) {
      const whitespace = /^[ \t\r\n]*/.exec(block.slice(cursor))![0].length;
      cursor += whitespace;
      if (!/^<table\b/i.test(block.slice(cursor))) break;
      const end = tableEnd(block, cursor);
      if (end === null) {
        warnings.push(AMBIGUOUS);
        break;
      }
      try {
        const document = new DOMParser().parseFromString(block.slice(cursor, end), 'text/html');
        const table = document.body.firstElementChild;
        if (table?.tagName !== 'TABLE' || document.body.children.length !== 1 || !table.querySelector('th, td')
          || Array.from(document.body.childNodes).some((child) => child !== table && child.textContent?.trim())) {
          warnings.push(AMBIGUOUS);
        } else {
          ranges.push({ start: start + cursor, end: start + end, kind: 'html' });
        }
      } catch {
        warnings.push('An HTML table could not be converted and was left unchanged.');
      }
      cursor = end;
    }
  }

  // Diagram repairs may span blank lines, but never cross code, HTML, links,
  // emphasis, lists, or quotes. Match only inside consecutive plain root nodes.
  for (let index = 0; index < root.children.length;) {
    const first = root.children[index];
    if (!onlyPlainDiagramNodes(first)) { index += 1; continue; }
    let last = first;
    while (++index < root.children.length && onlyPlainDiagramNodes(root.children[index])) last = root.children[index];
    const start = first.position?.start.offset;
    const end = last.position?.end.offset;
    if (start === undefined || end === undefined) continue;
    const pattern = new RegExp(`^ {0,3}\\|[ \\t]*\\r?\\n(${DIAGRAM_KEYWORDS}\\b[^]*?)\\r?\\n {0,3}\\|[ \\t]*\\r?\\n {0,3}\\|[ \\t]*---[ \\t]*\\|[ \\t]*(?=\\r?$)`, 'gmi');
    for (const match of source.slice(start, end).matchAll(pattern)) {
      ranges.push({ start: start + match.index!, end: start + match.index! + match[0].length, kind: 'diagram', body: match[1] });
    }
  }

  return { ranges: ranges.sort((a, b) => a.start - b.start), warnings: [...new Set(warnings)] };
}

export function hasConvertibleHtmlTables(source: string): boolean {
  return planEmbeddedTableConversions(source).ranges.length > 0;
}
