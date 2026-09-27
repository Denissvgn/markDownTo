import { describe, expect, it } from 'vitest';
import {
  getImportAdapterForFile,
  importAcceptAttribute,
  stripKnownImportExtension
} from './importRegistry';
import { UnsupportedImportError } from './types';

describe('import registry', () => {
  it('detects import adapters by extension before MIME type', () => {
    expect(getImportAdapterForFile(new File([''], 'notes.md', { type: 'text/plain' })).format).toBe('markdown');
    expect(getImportAdapterForFile(new File([''], 'word.docx', { type: 'application/octet-stream' })).format).toBe('docx');
    expect(getImportAdapterForFile(new File([''], 'page.HTML', { type: 'text/plain' })).format).toBe('html');
    expect(getImportAdapterForFile(new File([''], 'document.xml', { type: 'text/plain' })).format).toBe('xml');
  });

  it('falls back to MIME type when the extension is unknown', () => {
    expect(getImportAdapterForFile(new File([''], 'pasted', { type: 'text/html' })).format).toBe('html');
  });

  it('throws an explicit error for unsupported imports', () => {
    expect(() => getImportAdapterForFile(new File([''], 'report.pdf', { type: 'application/pdf' }))).toThrow(
      UnsupportedImportError
    );
  });

  it('exposes an accept attribute for all supported import formats', () => {
    expect(importAcceptAttribute).toContain('.docx');
    expect(importAcceptAttribute).toContain('.html');
    expect(importAcceptAttribute).toContain('.xml');
    expect(importAcceptAttribute).toContain('text/markdown');
  });

  it('strips known import extensions', () => {
    expect(stripKnownImportExtension('release-notes.markdown')).toBe('release-notes');
    expect(stripKnownImportExtension('page.htm')).toBe('page');
    expect(stripKnownImportExtension('archive')).toBe('archive');
  });

  it('converts embedded HTML tables when importing markdown files', async () => {
    const { markdownImporterAdapter } = await import('./importRegistry');
    const content = `# Title

<table class="confluenceTable"><tbody><tr><th>Col 1</th><th>Col 2</th></tr><tr><td>Val 1</td><td>Val 2</td></tr></tbody></table>`;

    const file = new File([content], 'synthetic-tables.md', { type: 'text/markdown' });
    const result = await markdownImporterAdapter.import(file);

    expect(result.markdown).not.toContain('<table');
    expect(result.markdown).toContain('| Col 1 | Col 2 |');
    expect(result.markdown).toContain('| Val 1 | Val 2 |');
  });
});
