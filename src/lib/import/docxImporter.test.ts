import { describe, expect, it } from 'vitest';
import { Document, ImageRun, Packer, Paragraph } from 'docx';
import { clientDocxExporter } from '../export/clientDocxExporter';
import { convertDocxToMarkdown } from './docxImporter';

describe('docxImporter', () => {
  it('imports a synthetic embedded PNG as a placeholder with a warning', async () => {
    const pixel = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPgL8sDAAGLAPQ8xSAqAAAAAElFTkSuQmCC'), (character) => character.charCodeAt(0));
    const bytes = await Packer.toBuffer(new Document({ sections: [{ children: [
      new Paragraph('Embedded image import'),
      new Paragraph({ children: [new ImageRun({ type: 'png', data: pixel, transformation: { width: 1, height: 1 } })] })
    ] }] }));
    const result = await convertDocxToMarkdown(Uint8Array.from(bytes).buffer);
    expect(result.markdown).toContain('Embedded image import');
    expect(result.markdown).toContain('[Embedded image omitted]');
    expect(result.warnings).toContain('Embedded DOCX image 1 (image/png) was replaced with placeholder text.');
  });

  it('converts an exported DOCX back to readable Markdown', async () => {
    const blob = await clientDocxExporter.export({
      markdown: `# DOCX Source

This document has **bold text**.

| Format | Status |
| --- | --- |
| DOCX | Active |
`,
      filenameBase: 'docx-source',
      title: 'DOCX Source',
      generatedAt: new Date('2026-05-22T00:00:00Z')
    });

    const result = await convertDocxToMarkdown(await blobToArrayBuffer(blob));

    expect(result.markdown).toContain('DOCX Source');
    expect(result.markdown).toContain('This document has');
    expect(result.markdown).toContain('**bold text**');
    expect(result.markdown).toContain('| **Format** | **Status** |');
    expect(result.markdown).toContain('| DOCX | Active |');
  });
});

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
