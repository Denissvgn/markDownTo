export type ImportFormat = 'markdown' | 'docx' | 'html' | 'xml';

export interface ImportResult {
  markdown: string;
  filenameBase: string;
  sourceFormat: ImportFormat;
  warnings: string[];
  /** Original Markdown when import conversion changes the source. */
  originalMarkdown?: string;
}

export interface ImportAdapter {
  format: ImportFormat;
  label: string;
  extensions: string[];
  mimeTypes: string[];
  import(file: File): Promise<ImportResult>;
}

export class UnsupportedImportError extends Error {
  constructor(filename: string) {
    super(`Unsupported import file: ${filename}. Choose a Markdown, DOCX, HTML, or MarkdownTo XML file.`);
    this.name = 'UnsupportedImportError';
  }
}

export class ImportConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportConversionError';
  }
}
