import { clientDocxExporter } from './clientDocxExporter';
import { exportToHtml } from './htmlExporter';
import { exportToXml } from './xmlExporter';
import { DeferredExportError } from './types';
import type { ExportAdapter, ExportFormat } from './types';

function deferredAdapter(format: 'pdf', label: string, extension: string, mimeType: string): ExportAdapter {
  return {
    format,
    label,
    extension,
    mimeType,
    status: 'deferred',
    disabledReason: 'Deferred after Markdown preview and DOCX export.',
    async export() {
      throw new DeferredExportError(format);
    }
  };
}

export const htmlExporterAdapter: ExportAdapter = {
  format: 'html',
  label: 'HTML',
  extension: 'html',
  mimeType: 'text/html',
  status: 'active',
  async export(request) {
    const html = exportToHtml(request.markdown, request.title);
    return new Blob([html], { type: 'text/html;charset=utf-8' });
  }
};

export const xmlExporterAdapter: ExportAdapter = {
  format: 'xml',
  label: 'XML',
  extension: 'xml',
  mimeType: 'application/xml',
  status: 'active',
  async export(request) {
    const xml = exportToXml(request.markdown, request.title, request.generatedAt);
    return new Blob([xml], { type: 'application/xml;charset=utf-8' });
  }
};

export const markdownExporterAdapter: ExportAdapter = {
  format: 'markdown',
  label: 'Markdown',
  extension: 'md',
  mimeType: 'text/markdown',
  status: 'active',
  async export(request) {
    return new Blob([request.markdown], { type: 'text/markdown;charset=utf-8' });
  }
};

export const exportAdapters: ExportAdapter[] = [
  markdownExporterAdapter,
  clientDocxExporter,
  htmlExporterAdapter,
  xmlExporterAdapter,
  deferredAdapter('pdf', 'PDF', 'pdf', 'application/pdf')
];

export function getExportAdapter(format: ExportFormat): ExportAdapter {
  const adapter = exportAdapters.find((candidate) => candidate.format === format);

  if (!adapter) {
    throw new Error(`No export adapter registered for ${format}.`);
  }

  return adapter;
}

export function getActiveExportAdapters(): ExportAdapter[] {
  return exportAdapters.filter((adapter) => adapter.status === 'active');
}
