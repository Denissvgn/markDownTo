import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { downloadBlob } from './lib/export/download';
import { markdownImporterAdapter } from './lib/import/importRegistry';
import type { ImportResult } from './lib/import/types';

vi.mock('./lib/export/download', () => ({ downloadBlob: vi.fn() }));
const table = '<table><tr><th>Key</th></tr><tr><td>Value</td></tr></table>';
const literal = `\`\`\`html\n${table}\n\`\`\``;
const original = `# Original\n\n${literal}\n\n${table}`;
const editor = () => screen.getByLabelText('Markdown source') as HTMLTextAreaElement;

function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

beforeEach(() => { localStorage.clear(); vi.mocked(downloadBlob).mockClear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('source preservation and recovery', () => {
  it('loads code and raw tables verbatim without changing stored source', () => {
    localStorage.setItem('markdown-to:draft', original);
    render(<App />);
    expect(editor()).toHaveValue(original);
    expect(localStorage.getItem('markdown-to:draft')).toBe(original);
    expect(screen.getByRole('button', { name: 'Convert HTML Tables' })).toBeVisible();
  });

  it('converts only real tables and supports restore/redo after further typing', async () => {
    const user = userEvent.setup();
    localStorage.setItem('markdown-to:draft', original);
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Convert HTML Tables' }));
    expect(screen.getByRole('group', { name: 'Source recovery' })).toBeVisible();
    expect(editor().value).toContain(literal);
    expect(editor().value).toContain('| Key |');
    expect(screen.queryByRole('button', { name: 'Convert HTML Tables' })).toBeNull();
    const changed = editor().value + '\n\nFurther typing';
    fireEvent.change(editor(), { target: { value: changed } });
    await user.click(screen.getByRole('button', { name: 'Restore previous source' }));
    expect(editor()).toHaveValue(original);
    await user.click(screen.getByRole('button', { name: 'Restore previous source' }));
    expect(editor()).toHaveValue(changed);
  });

  it('retains downloadable original source and recovery with blocked storage', async () => {
    const user = userEvent.setup();
    localStorage.setItem('markdown-to:draft', original);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Convert HTML Tables' }));
    await user.click(screen.getByRole('button', { name: 'Download previous source' }));
    expect(await blobText(vi.mocked(downloadBlob).mock.calls[0][0])).toBe(original);
    await user.click(screen.getByRole('button', { name: 'Restore previous source' }));
    expect(editor()).toHaveValue(original);
    expect(screen.getByRole('status', { name: 'Browser saving' })).toHaveTextContent('could not be saved');
  });

  it('keeps both the replaced draft and the pre-conversion Markdown import', async () => {
    const user = userEvent.setup();
    localStorage.setItem('markdown-to:draft', '# Previous draft');
    localStorage.setItem('markdown-to:filename', 'previous');
    const { container } = render(<App />);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File([original], 'incoming.md', { type: 'text/markdown' })] } });
    await waitFor(() => expect(editor().value).toContain('| Key |'));
    expect(screen.getByRole('group', { name: 'Source recovery' })).toBeVisible();
    expect(editor().value).toContain(literal);
    await user.click(screen.getByRole('button', { name: 'Download original import' }));
    expect(await blobText(vi.mocked(downloadBlob).mock.calls[0][0])).toBe(original);
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe('incoming-original.md');
    await user.click(screen.getByRole('button', { name: 'Download previous source' }));
    expect(await blobText(vi.mocked(downloadBlob).mock.calls[1][0])).toBe('# Previous draft');
    await user.click(screen.getByRole('button', { name: 'Restore previous source' }));
    expect(editor()).toHaveValue('# Previous draft');
    expect(screen.getByRole('textbox', { name: 'Filename' })).toHaveValue('previous');
  });

  it('preserves rich paste into literal code and does not claim conversion', () => {
    localStorage.setItem('markdown-to:draft', 'before `` after');
    render(<App />);
    editor().setSelectionRange(8, 8);
    fireEvent.paste(editor(), { clipboardData: { getData: (type: string) => type === 'text/plain' ? 'literal cell' : table } });
    expect(editor()).toHaveValue('before `literal cell` after');
    expect(screen.getByText('Pasted source preserved')).toBeVisible();
  });

  it('does not steal focus after the user leaves the editor before the paste frame runs', () => {
    let queued: FrameRequestCallback | undefined;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => { queued = callback; return 1; });
    render(<App />);
    fireEvent.change(editor(), { target: { value: '' } });
    editor().focus();
    editor().setSelectionRange(0, 0);
    fireEvent.paste(editor(), { clipboardData: { getData: (type: string) => type === 'text/plain' ? table : '' } });
    expect(queued).toBeTypeOf('function');
    const filename = screen.getByRole('textbox', { name: 'Filename' });
    filename.focus();
    act(() => { queued?.(0); });
    expect(filename).toHaveFocus();
  });

  it('uses the latest document for recovery and ignores an older import response', async () => {
    const pending: Array<(value: ImportResult) => void> = [];
    vi.spyOn(markdownImporterAdapter, 'import').mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    const user = userEvent.setup();
    const { container } = render(<App />);
    const input = container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(['first'], 'first.md')] } });
    fireEvent.change(editor(), { target: { value: '# Typed during import' } });
    fireEvent.change(input, { target: { files: [new File(['second'], 'second.md')] } });
    await act(async () => pending[1]({ markdown: '# Second import', filenameBase: 'second', sourceFormat: 'markdown', warnings: [] }));
    await act(async () => pending[0]({ markdown: '# Stale first import', filenameBase: 'first', sourceFormat: 'markdown', warnings: [] }));
    expect(editor()).toHaveValue('# Second import');
    await user.click(screen.getByRole('button', { name: 'Restore previous source' }));
    expect(editor()).toHaveValue('# Typed during import');
  });
});

it.each(['markdown', 'filename', 'conversion', 'paste'])('cancels a pending import after a local %s change', async (change) => {
  let resolve!: (result: ImportResult) => void;
  vi.spyOn(markdownImporterAdapter, 'import').mockImplementation(() => new Promise((done) => { resolve = done; }));
  localStorage.setItem('markdown-to:draft', original);
  const { container } = render(<App />);
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['late'], 'late.md')] } });
  if (change === 'markdown') fireEvent.change(editor(), { target: { value: '# New typing' } });
  if (change === 'filename') fireEvent.change(screen.getByRole('textbox', { name: 'Filename' }), { target: { value: 'renamed' } });
  if (change === 'conversion') fireEvent.click(screen.getByRole('button', { name: 'Convert HTML Tables' }));
  if (change === 'paste') {
    editor().setSelectionRange(0, 0);
    fireEvent.paste(editor(), { clipboardData: { getData: (type: string) => type === 'text/plain' ? table : '' } });
  }
  const draft = editor().value;
  const filename = (screen.getByRole('textbox', { name: 'Filename' }) as HTMLInputElement).value;
  await act(async () => resolve({ markdown: '# Late overwrite', filenameBase: 'late', sourceFormat: 'markdown', warnings: [] }));
  expect(editor()).toHaveValue(draft);
  expect(screen.getByRole('textbox', { name: 'Filename' })).toHaveValue(filename);
  expect(screen.queryByText('Importing Markdown')).toBeNull();
});
