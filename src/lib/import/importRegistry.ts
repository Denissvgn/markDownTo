import { convertDocxToMarkdown } from './docxImporter';
import { convertEmbeddedHtmlTables, convertHtmlToMarkdown } from './htmlImporter';
import { convertXmlToMarkdown } from './xmlImporter';
import { UnsupportedImportError } from './types';
import type { ImportAdapter, ImportFormat, ImportResult } from './types';

const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.txt'];
const DOCX_EXTENSIONS = ['.docx'];
const HTML_EXTENSIONS = ['.html', '.htm'];
const XML_EXTENSIONS = ['.xml'];

export const markdownImporterAdapter: ImportAdapter = {
  format: 'markdown',
  label: 'Markdown',
  extensions: MARKDOWN_EXTENSIONS,
  mimeTypes: ['text/markdown', 'text/plain'],
  async import(file) {
    const rawText = await readFileText(file);
    const result = convertEmbeddedHtmlTables(rawText);
    return {
      ...createImportResult(file, 'markdown', result.markdown, result.warnings),
      ...(result.markdown !== rawText ? { originalMarkdown: rawText } : {})
    };
  }
};

export const docxImporterAdapter: ImportAdapter = {
  format: 'docx',
  label: 'DOCX',
  extensions: DOCX_EXTENSIONS,
  mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  async import(file) {
    const result = await convertDocxToMarkdown(await readFileArrayBuffer(file));
    return createImportResult(file, 'docx', result.markdown, result.warnings);
  }
};

export const htmlImporterAdapter: ImportAdapter = {
  format: 'html',
  label: 'HTML',
  extensions: HTML_EXTENSIONS,
  mimeTypes: ['text/html', 'application/xhtml+xml'],
  async import(file) {
    const result = convertHtmlToMarkdown(await readFileText(file));
    return createImportResult(file, 'html', result.markdown, result.warnings);
  }
};

export const xmlImporterAdapter: ImportAdapter = {
  format: 'xml',
  label: 'MarkdownTo XML',
  extensions: XML_EXTENSIONS,
  mimeTypes: ['application/xml', 'text/xml'],
  async import(file) {
    const result = convertXmlToMarkdown(await readFileText(file));
    return createImportResult(file, 'xml', result.markdown, result.warnings);
  }
};

export const importAdapters: ImportAdapter[] = [
  markdownImporterAdapter,
  docxImporterAdapter,
  htmlImporterAdapter,
  xmlImporterAdapter
];

export const acceptedImportExtensions = importAdapters.flatMap((adapter) => adapter.extensions);

export const importAcceptAttribute = [
  ...acceptedImportExtensions,
  ...importAdapters.flatMap((adapter) => adapter.mimeTypes)
].join(',');

export function getImportAdapterForFile(file: File): ImportAdapter {
  const lowerName = file.name.toLowerCase();
  const extensionMatch = importAdapters.find((adapter) =>
    adapter.extensions.some((extension) => lowerName.endsWith(extension))
  );

  if (extensionMatch) {
    return extensionMatch;
  }

  const mimeType = file.type.toLowerCase();
  const mimeMatch = importAdapters.find((adapter) => adapter.mimeTypes.includes(mimeType));

  if (mimeMatch) {
    return mimeMatch;
  }

  throw new UnsupportedImportError(file.name);
}

export function stripKnownImportExtension(filename: string): string {
  const lowerName = filename.toLowerCase();
  const extension = [...acceptedImportExtensions]
    .sort((first, second) => second.length - first.length)
    .find((candidate) => lowerName.endsWith(candidate));

  return extension ? filename.slice(0, -extension.length) : filename;
}

function createImportResult(file: File, sourceFormat: ImportFormat, markdown: string, warnings: string[]): ImportResult {
  return {
    markdown,
    filenameBase: stripKnownImportExtension(file.name),
    sourceFormat,
    warnings: dedupeWarnings(warnings)
  };
}

function dedupeWarnings(warnings: string[]): string[] {
  return Array.from(new Set(warnings.filter(Boolean)));
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Could not read import file.')));
    reader.readAsText(file);
  });
}

function readFileArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result as ArrayBuffer));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Could not read import file.')));
    reader.readAsArrayBuffer(file);
  });
}
