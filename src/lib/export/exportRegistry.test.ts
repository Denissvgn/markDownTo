import { describe, expect, it } from 'vitest';
import { exportAdapters, getActiveExportAdapters, getExportAdapter } from './exportRegistry';
import { DeferredExportError } from './types';

describe('export registry', () => {
  it('keeps Markdown, DOCX, HTML, and XML active, and PDF deferred', () => {
    expect(getActiveExportAdapters().map((adapter) => adapter.format)).toEqual(['markdown', 'docx', 'html', 'xml']);
    expect(exportAdapters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ format: 'markdown', status: 'active' }),
        expect.objectContaining({ format: 'pdf', status: 'deferred' }),
        expect.objectContaining({ format: 'html', status: 'active' }),
        expect.objectContaining({ format: 'xml', status: 'active' })
      ])
    );
  });

  it('exports exact source Markdown', async () => {
    const markdown = '# Raw Markdown\n\nPreserve trailing spaces  \n\n- Item\n';
    const blob = await getExportAdapter('markdown').export({
      markdown,
      filenameBase: 'raw-markdown',
      title: 'Raw Markdown',
      generatedAt: new Date('2026-05-22T00:00:00Z')
    });

    expect(blob.type).toBe('text/markdown;charset=utf-8');
    expect(await blobToText(blob)).toBe(markdown);
  });

  it('uses the safe HTML serializer for the active download adapter', async () => {
    const blob = await getExportAdapter('html').export({
      markdown: '```x"><svg/onload=globalThis.__probe=1>\ncode\n```\n\n[unsafe](javascript:globalThis.__probe=2)',
      filenameBase: 'safe-export',
      title: 'Safe export',
      generatedAt: new Date('2026-09-27T00:00:00Z')
    });
    expect(blob.type).toBe('text/html;charset=utf-8');
    const document = new DOMParser().parseFromString(await blobToText(blob), 'text/html');
    expect(document.querySelector('svg, script, a')).toBeNull();
    expect(document.querySelector('code')?.textContent).toBe('code');
    expect(document.body.textContent).toContain('unsafe');
  });

  it('throws explicit deferred errors for later formats', async () => {
    await expect(
      getExportAdapter('pdf').export({
        markdown: '# Later',
        filenameBase: 'later',
        title: 'Later',
        generatedAt: new Date('2026-05-22T00:00:00Z')
      })
    ).rejects.toBeInstanceOf(DeferredExportError);
  });
});

function blobToText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') {
    return blob.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Could not read Blob text.')));
    reader.readAsText(blob);
  });
}
