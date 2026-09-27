import type { Nodes } from 'mdast';
import { parseMarkdown } from '../markdown/parser';
import { convertEmbeddedHtmlTables, convertHtmlToMarkdown, hasConvertibleHtmlTables } from './htmlImporter';

function containsCode(node: Nodes): boolean {
  return node.type === 'code' || node.type === 'inlineCode'
    || ('children' in node && node.children.some(containsCode));
}

export function selectionTouchesCode(source: string, start: number, end: number, enclosingOnly = false): boolean {
  const visit = (node: Nodes): boolean => {
    if (node.type === 'code' || node.type === 'inlineCode') {
      const from = node.position?.start.offset;
      const to = node.position?.end.offset;
      if (from === undefined || to === undefined) return false;
      if (enclosingOnly) return from < start && to > start;
      if (start < to && end > from) return true;
      if (start === end && start > from && start < to) return true;
      if (start === to && node.type === 'code') {
        const raw = source.slice(from, to);
        const opening = /^ {0,3}(`{3,}|~{3,})[^\r\n]*\r?\n/.exec(raw);
        if (!opening) return true; // Indented code or a still-open fence line.
        const marker = opening[1][0];
        const lastLine = raw.slice(raw.lastIndexOf('\n') + 1);
        return !new RegExp(`^ {0,3}${marker}{${opening[1].length},}[ \\t]*$`).test(lastLine);
      }
      return false;
    }
    return 'children' in node && node.children.some(visit);
  };
  return visit(parseMarkdown(source));
}

export interface MarkdownPasteResult {
  markdown: string;
  caret: number;
  converted: boolean;
  warnings: string[];
}

export function prepareMarkdownPaste(source: string, start: number, end: number, plain: string, html: string): MarkdownPasteResult | null {
  if (!/<table\b/i.test(plain + html) && !hasConvertibleHtmlTables(plain)) return null;
  const before = source.slice(0, start);
  const after = source.slice(end);
  const original = plain || html;
  if (selectionTouchesCode(source, start, end) || selectionTouchesCode(before + original + after, start, start + original.length, true)) {
    return { markdown: before + original + after, caret: start + original.length, converted: false, warnings: [] };
  }
  if (/<table\b/i.test(html) && !/<table\b/i.test(plain) && !containsCode(parseMarkdown(plain))) {
    const result = convertHtmlToMarkdown(html);
    if (result.markdown.trim()) {
      const newline = source.match(/\r?\n/)?.[0] ?? '\n';
      const prefix = before && !/(?:\r?\n){2}$/.test(before) ? newline + newline : '';
      const suffix = after && !/^(?:\r?\n){2}/.test(after) ? newline + newline : '';
      const inserted = prefix + result.markdown.trim().replace(/\r?\n/g, newline) + suffix;
      return { markdown: before + inserted + after, caret: start + inserted.length, converted: true, warnings: result.warnings };
    }
  }
  const candidate = before + original + after;
  const result = convertEmbeddedHtmlTables(candidate, {}, { start, end: start + original.length });
  return { markdown: result.markdown, caret: start + original.length + result.markdown.length - candidate.length, converted: result.markdown !== candidate, warnings: result.warnings };
}
