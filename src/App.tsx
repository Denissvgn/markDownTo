import { ChangeEvent, ClipboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, FileUp, RefreshCw, Maximize2, Minimize2, Sun, Moon, Wand2 } from 'lucide-react';
import { sampleMarkdown } from './data/sampleMarkdown';
import { downloadBlob } from './lib/export/download';
import { exportAdapters } from './lib/export/exportRegistry';
import type { ExportAdapter } from './lib/export/types';
import { getImportAdapterForFile, importAcceptAttribute } from './lib/import/importRegistry';
import { convertEmbeddedHtmlTables, hasConvertibleHtmlTables } from './lib/import/htmlImporter';
import { extractDocumentTitle, slugifyFilename } from './lib/markdown/parser';
import { prepareMarkdownPaste } from './lib/import/editorPaste';
import { MarkdownPreview } from './components/MarkdownPreview';

const DRAFT_STORAGE_KEY = 'markdown-to:draft';
const FILENAME_STORAGE_KEY = 'markdown-to:filename';
const THEME_STORAGE_KEY = 'markdown-to:theme';

interface DocumentSnapshot { markdown: string; filenameBase: string; }

type ExportState =
  | { status: 'idle'; message: string }
  | { status: 'working'; message: string }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

function loadStoredValue(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveStoredValue(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    // Both the storage getter and setItem can throw in restricted browsers.
    return false;
  }
}

export default function App() {
  const [markdown, setMarkdown] = useState(() => loadStoredValue(DRAFT_STORAGE_KEY, sampleMarkdown));
  const [filenameBase, setFilenameBase] = useState(() => loadStoredValue(FILENAME_STORAGE_KEY, 'release-notes'));
  const [exportState, setExportState] = useState<ExportState>({ status: 'idle', message: 'Ready' });
  const [previousDocument, setPreviousDocument] = useState<DocumentSnapshot | null>(null);
  const [originalImport, setOriginalImport] = useState<DocumentSnapshot | null>(null);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
  const [filenameSaveFailed, setFilenameSaveFailed] = useState(false);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return (window.localStorage.getItem(THEME_STORAGE_KEY) as 'light' | 'dark') ?? 'light';
    } catch {
      return 'light';
    }
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const currentDocument = useRef({ markdown, filenameBase });
  const importRequest = useRef(0);
  useLayoutEffect(() => { currentDocument.current = { markdown, filenameBase }; }, [markdown, filenameBase]);

  const title = useMemo(() => extractDocumentTitle(markdown), [markdown]);
  const safeFilename = useMemo(() => slugifyFilename(filenameBase || title), [filenameBase, title]);
  const stats = useMemo(() => {
    const words = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
    const characters = markdown.length;
    return { words, characters };
  }, [markdown]);
  const hasEmbeddedHtmlTables = useMemo(() => hasConvertibleHtmlTables(markdown), [markdown]);

  useEffect(() => {
    setDraftSaveFailed(!saveStoredValue(DRAFT_STORAGE_KEY, markdown));
  }, [markdown]);

  useEffect(() => {
    setFilenameSaveFailed(!saveStoredValue(FILENAME_STORAGE_KEY, filenameBase));
  }, [filenameBase]);

  // Handle data-theme updates
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Local storage can be unavailable in restricted browser contexts.
    }
  }, [theme]);

  // Close fullscreen preview on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isPreviewFullscreen) {
        setIsPreviewFullscreen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPreviewFullscreen]);

  function handleRetrySaving() {
    const draftSaved = saveStoredValue(DRAFT_STORAGE_KEY, markdown);
    const filenameSaved = saveStoredValue(FILENAME_STORAGE_KEY, filenameBase);
    setDraftSaveFailed(!draftSaved);
    setFilenameSaveFailed(!filenameSaved);
    if (draftSaved && filenameSaved) editorRef.current?.focus();
  }

  function rememberSource() {
    setPreviousDocument(currentDocument.current);
  }

  function handleRestoreSource() {
    if (!previousDocument) return;
    const restored = previousDocument;
    rememberSource();
    importRequest.current += 1;
    setMarkdown(restored.markdown);
    setFilenameBase(restored.filenameBase);
    setExportState({ status: 'success', message: 'Previous source restored. The replaced source is available for recovery.' });
    editorRef.current?.focus();
  }

  function handleDownloadSource(document: DocumentSnapshot, label: 'previous' | 'original') {
    try {
      downloadBlob(new Blob([document.markdown], { type: 'text/markdown;charset=utf-8' }), `${slugifyFilename(document.filenameBase)}-${label}.md`);
      setExportState({ status: 'success', message: `${label === 'previous' ? 'Previous source' : 'Original import'} downloaded` });
    } catch (error) {
      setExportState({ status: 'error', message: error instanceof Error ? error.message : 'Source download failed.' });
    }
  }

  function invalidatePendingImport() {
    importRequest.current += 1;
    setExportState((current) => current.status === 'working' && current.message.startsWith('Importing ')
      ? { status: 'idle', message: 'Import canceled because the document changed. Select the file again to import.' }
      : current);
  }

  function handleConvertHtmlTables() {
    const converted = convertEmbeddedHtmlTables(markdown);
    if (converted.markdown === markdown) {
      setExportState({ status: 'idle', message: `No eligible tables were converted${formatImportWarningSummary(converted.warnings)}` });
      return;
    }
    rememberSource();
    invalidatePendingImport();
    setMarkdown(converted.markdown);
    setExportState({ status: 'success', message: `Converted HTML tables to Markdown${formatImportWarningSummary(converted.warnings)}` });
  }

  function handleEditorPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const editor = event.currentTarget;
    try {
      const pasted = prepareMarkdownPaste(editor.value, editor.selectionStart, editor.selectionEnd,
        event.clipboardData.getData('text/plain'), event.clipboardData.getData('text/html'));
      if (!pasted) return;
      event.preventDefault();
      rememberSource();
      invalidatePendingImport();
      setMarkdown(pasted.markdown);
      setExportState({ status: 'success', message: `${pasted.converted ? 'Pasted table converted to Markdown' : 'Pasted source preserved'}${formatImportWarningSummary(pasted.warnings)}` });
      requestAnimationFrame(() => {
        if (editorRef.current !== editor || document.activeElement !== editor || currentDocument.current.markdown !== pasted.markdown) return;
        editor.setSelectionRange(pasted.caret, pasted.caret);
        editor.focus();
      });
    } catch (error) {
      // Keep native plain-text paste available if conversion cannot run.
      setExportState({ status: 'error', message: error instanceof Error ? error.message : 'Paste conversion failed; source was preserved.' });
    }
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    event.target.value = '';
    const request = ++importRequest.current;
    try {
      const adapter = getImportAdapterForFile(file);
      setExportState({ status: 'working', message: `Importing ${adapter.label}` });

      const result = await adapter.import(file);
      if (request !== importRequest.current) return;
      const warningSummary = formatImportWarningSummary(result.warnings);
      rememberSource();
      setOriginalImport(result.originalMarkdown === undefined ? null : { markdown: result.originalMarkdown, filenameBase: result.filenameBase });

      setMarkdown(result.markdown);
      setFilenameBase(result.filenameBase);
      setExportState({ status: 'success', message: `${file.name} imported${warningSummary}` });
    } catch (error) {
      if (request !== importRequest.current) return;
      const message = error instanceof Error ? error.message : 'File import failed.';
      setExportState({ status: 'error', message });
    }
  }

  async function handleDownload(adapter: ExportAdapter) {
    setExportState({ status: 'working', message: `Creating ${adapter.label}` });

    try {
      const blob = await adapter.export({
        markdown,
        filenameBase: safeFilename,
        title,
        generatedAt: new Date()
      });

      downloadBlob(blob, `${safeFilename}.${adapter.extension}`);
      setExportState({ status: 'success', message: `${safeFilename}.${adapter.extension} downloaded` });
    } catch (error) {
      const message = error instanceof Error ? error.message : `${adapter.label} export failed.`;
      setExportState({ status: 'error', message });
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <FileText aria-hidden="true" size={28} />
          <div>
            <h1>MarkdownTo</h1>
            <p>{title}</p>
          </div>
        </div>

        <div className="toolbar" aria-label="Document actions">
          <button
            type="button"
            className="icon-button secondary theme-toggle"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {theme === 'light' ? <Moon aria-hidden="true" size={18} /> : <Sun aria-hidden="true" size={18} />}
          </button>
          <button type="button" className="icon-button secondary" onClick={() => fileInputRef.current?.click()}>
            <FileUp aria-hidden="true" size={18} />
            Import
          </button>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept={importAcceptAttribute}
            onChange={handleFileSelected}
          />
          <button
            type="button"
            className="icon-button secondary"
            onClick={() => {
              rememberSource();
              importRequest.current += 1;
              setMarkdown(sampleMarkdown);
              setFilenameBase('release-notes');
              setExportState({ status: 'success', message: 'Sample loaded' });
            }}
          >
            <RefreshCw aria-hidden="true" size={18} />
            Sample
          </button>
        </div>
      </header>

      <section className="export-bar" aria-label="Export formats">
        <label className="filename-field">
          <span>Filename</span>
          <input value={filenameBase} onChange={(event) => { invalidatePendingImport(); setFilenameBase(event.target.value); }} />
        </label>

        <div className="export-actions">
          {exportAdapters.map((adapter) =>
            adapter.status === 'active' ? (
              <button
                key={adapter.format}
                type="button"
                className="icon-button primary"
                onClick={() => handleDownload(adapter)}
                disabled={exportState.status === 'working'}
              >
                <Download aria-hidden="true" size={18} />
                {exportState.status === 'working' ? 'Creating' : `Download ${adapter.label}`}
              </button>
            ) : (
              <button
                key={adapter.format}
                type="button"
                className="icon-button muted"
                disabled
                title={adapter.disabledReason}
              >
                {adapter.label}
              </button>
            )
          )}
        </div>
      </section>

      <section className="workspace" aria-label="Markdown workspace">
        <section className="pane editor-pane">
          <div className="pane-header">
            <h2>Markdown</h2>
            <div className="pane-header-actions">
              {hasEmbeddedHtmlTables && (
                <button
                  type="button"
                  className="icon-button primary"
                  onClick={handleConvertHtmlTables}
                  title="Convert HTML tables in document to Markdown pipe tables"
                >
                  <Wand2 aria-hidden="true" size={14} />
                  Convert HTML Tables
                </button>
              )}
              <span>
                {stats.words} words / {stats.characters} chars
              </span>
            </div>
          </div>
          <textarea
            ref={editorRef}
            aria-label="Markdown source"
            spellCheck="false"
            value={markdown}
            onChange={(event) => { invalidatePendingImport(); setMarkdown(event.target.value); }}
            onPaste={handleEditorPaste}
          />
        </section>

        <section className={`pane preview-pane ${isPreviewFullscreen ? 'fullscreen' : ''}`}>
          <div className="pane-header">
            <h2>Preview</h2>
            <div className="pane-header-actions">
              <span>GFM</span>
              <button
                type="button"
                className="fullscreen-toggle-btn"
                onClick={() => setIsPreviewFullscreen(!isPreviewFullscreen)}
                title={isPreviewFullscreen ? "Exit Fullscreen" : "Fullscreen Preview"}
                aria-label={isPreviewFullscreen ? "Exit Fullscreen" : "Fullscreen Preview"}
              >
                {isPreviewFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </div>
          </div>
          <article className="markdown-preview" aria-label="Rendered markdown preview">
            <MarkdownPreview markdown={markdown} />
          </article>
        </section>
      </section>

      <footer className={`status-line ${exportState.status}`}>
        <span aria-live="polite">{exportState.message}</span>
        <div role="status" aria-label="Browser saving" aria-live="polite" aria-atomic="true">
          {(draftSaveFailed || filenameSaveFailed) && (
            <div className="persistence-warning">
              <span>
                {draftSaveFailed && filenameSaveFailed ? 'Draft and filename' : draftSaveFailed ? 'Draft' : 'Filename'}{' '}
                could not be saved in this browser. Download Markdown before leaving this page to keep your text.
              </span>
              <button type="button" className="icon-button secondary" onClick={handleRetrySaving}>
                Retry saving
              </button>
            </div>
          )}
        </div>
        {(previousDocument || originalImport) && (
          <div className="source-recovery" role="group" aria-label="Source recovery">
            {previousDocument && <>
              <button type="button" className="icon-button secondary" onClick={handleRestoreSource}>Restore previous source</button>
              <button type="button" className="icon-button secondary" onClick={() => handleDownloadSource(previousDocument, 'previous')}>Download previous source</button>
            </>}
            {originalImport && <button type="button" className="icon-button secondary" onClick={() => handleDownloadSource(originalImport, 'original')}>Download original import</button>}
            <span>Recovery copies stay in this tab until replaced or closed.</span>
          </div>
        )}
      </footer>
    </main>
  );
}

function formatImportWarningSummary(warnings: string[]): string {
  if (warnings.length === 0) {
    return '';
  }

  const suffix = warnings.length === 1 ? 'warning' : 'warnings';
  return ` with ${warnings.length} ${suffix}: ${warnings[0]}`;
}
