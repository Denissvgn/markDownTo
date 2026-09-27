import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { clientDocxExporter } from './clientDocxExporter';

describe('clientDocxExporter', () => {
  it('returns a valid DOCX archive with document text', async () => {
    const blob = await clientDocxExporter.export({
      markdown: `# Release Notes

This document exports **bold text**.

| Format | Status |
| --- | --- |
| DOCX | Active |
`,
      filenameBase: 'release-notes',
      title: 'Release Notes',
      generatedAt: new Date('2026-05-22T00:00:00Z')
    });

    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    const { documentXml, zip } = await readDocx(blob);
    expect(documentXml).toContain('Release Notes');
    expect(documentXml).toContain('DOCX');
    expect(zip.file('[Content_Types].xml')).toBeTruthy();
    expect(zip.file('word/document.xml')).toBeTruthy();
  });

  it('preserves a blank line between consecutive markdown tables', async () => {
    const blob = await clientDocxExporter.export({
      markdown: `| A | B |
| --- | --- |
| 1 | 2 |

| C | D |
| --- | --- |
| 3 | 4 |
`,
      filenameBase: 'two-tables',
      title: 'Two Tables',
      generatedAt: new Date('2026-05-22T00:00:00Z')
    });

    const { documentXml } = await readDocx(blob);
    expect(documentXml).toContain('</w:tbl><w:p/><w:tbl>');
  });
});

async function readDocx(blob: Blob): Promise<{ documentXml: string; zip: JSZip }> {
  const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));
  const documentXml = await zip.file('word/document.xml')?.async('string');

  if (!documentXml) {
    throw new Error('DOCX did not include word/document.xml.');
  }

  return { documentXml, zip };
}

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result as ArrayBuffer));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Could not read DOCX blob.')));
    reader.readAsArrayBuffer(blob);
  });
}
