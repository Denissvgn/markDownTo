export type ExportFormat = 'markdown' | 'docx' | 'pdf' | 'html' | 'xml';

export type ExportStatus = 'active' | 'deferred';

export interface ExportRequest {
  markdown: string;
  filenameBase: string;
  title: string;
  generatedAt: Date;
}

export interface ExportAdapter {
  format: ExportFormat;
  label: string;
  extension: string;
  mimeType: string;
  status: ExportStatus;
  disabledReason?: string;
  export(request: ExportRequest): Promise<Blob>;
}

export class DeferredExportError extends Error {
  constructor(format: ExportFormat) {
    super(`${format.toUpperCase()} export is deferred for a later phase.`);
    this.name = 'DeferredExportError';
  }
}
