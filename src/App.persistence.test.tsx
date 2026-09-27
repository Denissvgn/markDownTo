import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { downloadBlob } from './lib/export/download';

vi.mock('./lib/export/download', () => ({ downloadBlob: vi.fn() }));

const DRAFT_KEY = 'markdown-to:draft';
const FILENAME_KEY = 'markdown-to:filename';

function savingStatus() {
  return screen.getByRole('status', { name: 'Browser saving' });
}

function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(downloadBlob).mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('draft persistence failures', () => {
  it.each(['QuotaExceededError', 'SecurityError'])('keeps editing, renaming, importing, and downloading usable after %s', async (name) => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage unavailable', name); });
    const user = userEvent.setup();
    const { container } = render(<App />);
    const editor = screen.getByLabelText('Markdown source');
    expect(editor).toBeVisible();
    expect(savingStatus()).toHaveTextContent('Draft and filename could not be saved');

    fireEvent.change(editor, { target: { value: '# In memory\n\nLatest draft' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Filename' }), { target: { value: 'in-memory' } });
    expect(editor).toHaveValue('# In memory\n\nLatest draft');
    expect(screen.getByRole('heading', { name: 'In memory' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Filename' })).toHaveValue('in-memory');
    for (const format of ['Markdown', 'DOCX', 'HTML', 'XML']) {
      expect(screen.getByRole('button', { name: `Download ${format}` })).toBeEnabled();
    }

    const source = '# Imported while unsaved\n\nExact body  \n';
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File([source], 'imported.md', { type: 'text/markdown' })] }
    });
    await waitFor(() => expect(editor).toHaveValue(source));
    expect(screen.getByRole('textbox', { name: 'Filename' })).toHaveValue('imported');
    await user.click(screen.getByRole('button', { name: 'Download Markdown' }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    const [blob, filename] = vi.mocked(downloadBlob).mock.calls[0];
    expect(filename).toBe('imported.md');
    expect(await blobText(blob)).toBe(source);
    expect(screen.getByText('imported.md downloaded', { exact: true })).toBeVisible();
    expect(savingStatus()).toHaveTextContent('Draft and filename could not be saved');
  });

  it.each([DRAFT_KEY, FILENAME_KEY])('does not hide a failed %s write behind other successful writes or downloads', async (failedKey) => {
    const originalSetItem = Storage.prototype.setItem;
    let blocked = true;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (blocked && key === failedKey) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      originalSetItem.call(this, key, value);
    });
    const user = userEvent.setup();
    render(<App />);
    const message = failedKey === DRAFT_KEY ? 'Draft could not be saved' : 'Filename could not be saved';
    expect(savingStatus()).toHaveTextContent(message);
    if (failedKey === DRAFT_KEY) {
      fireEvent.change(screen.getByRole('textbox', { name: 'Filename' }), { target: { value: 'changed-filename' } });
    } else {
      fireEvent.change(screen.getByLabelText('Markdown source'), { target: { value: '# Changed text' } });
    }
    await user.click(screen.getByRole('button', { name: /Switch to .* theme/ }));
    await user.click(screen.getByRole('button', { name: 'Download Markdown' }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    expect(savingStatus()).toHaveTextContent(message);
    expect(savingStatus()).not.toHaveTextContent('Draft and filename');

    blocked = false;
    await user.click(screen.getByRole('button', { name: 'Retry saving' }));
    expect(savingStatus()).toBeEmptyDOMElement();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBe((screen.getByLabelText('Markdown source') as HTMLTextAreaElement).value);
    expect(window.localStorage.getItem(FILENAME_KEY)).toBe((screen.getByRole('textbox', { name: 'Filename' }) as HTMLInputElement).value);
    expect(screen.getByLabelText('Markdown source')).toHaveFocus();
  });

  it('clears only the recovered field after a later successful edit', () => {
    const originalSetItem = Storage.prototype.setItem;
    const blocked = new Set([DRAFT_KEY, FILENAME_KEY]);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (blocked.has(key)) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      originalSetItem.call(this, key, value);
    });
    render(<App />);
    expect(savingStatus()).toHaveTextContent('Draft and filename could not be saved');
    blocked.delete(DRAFT_KEY);
    fireEvent.change(screen.getByLabelText('Markdown source'), { target: { value: '# Saved text' } });
    expect(savingStatus()).toHaveTextContent('Filename could not be saved');
    expect(window.localStorage.getItem(DRAFT_KEY)).toBe('# Saved text');
    blocked.delete(FILENAME_KEY);
    fireEvent.change(screen.getByRole('textbox', { name: 'Filename' }), { target: { value: 'saved-name' } });
    expect(savingStatus()).toBeEmptyDOMElement();
    expect(window.localStorage.getItem(FILENAME_KEY)).toBe('saved-name');
  });

  it('reports quota exhaustion that begins after healthy saves and preserves the last stored draft', () => {
    const originalSetItem = Storage.prototype.setItem;
    let blocked = false;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (blocked && key === DRAFT_KEY) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      originalSetItem.call(this, key, value);
    });
    render(<App />);
    fireEvent.change(screen.getByLabelText('Markdown source'), { target: { value: '# Saved successfully' } });
    expect(savingStatus()).toBeEmptyDOMElement();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBe('# Saved successfully');
    blocked = true;
    fireEvent.change(screen.getByLabelText('Markdown source'), { target: { value: '# Quota now exhausted' } });
    expect(screen.getByLabelText('Markdown source')).toHaveValue('# Quota now exhausted');
    expect(savingStatus()).toHaveTextContent('Draft could not be saved');
    expect(window.localStorage.getItem(DRAFT_KEY)).toBe('# Saved successfully');
    fireEvent.change(screen.getByRole('textbox', { name: 'Filename' }), { target: { value: 'still-renamable' } });
    expect(savingStatus()).toHaveTextContent('Draft could not be saved');
    blocked = false;
    fireEvent.change(screen.getByLabelText('Markdown source'), { target: { value: '# Saving works again' } });
    expect(savingStatus()).toBeEmptyDOMElement();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBe('# Saving works again');
  });

  it('keeps the warning and retry control when a retry still fails', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Retry saving' }));
    expect(savingStatus()).toHaveTextContent('Draft and filename could not be saved');
    expect(screen.getByRole('button', { name: 'Retry saving' })).toHaveFocus();
    expect(screen.getByLabelText('Markdown source')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Download Markdown' })).toBeEnabled();
  });

  it('catches a blocked localStorage property getter as well as blocked methods', async () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('Blocked access', 'SecurityError'); });
    const user = userEvent.setup();
    render(<App />);
    fireEvent.change(screen.getByLabelText('Markdown source'), { target: { value: '# Getter blocked' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Filename' }), { target: { value: 'getter-blocked' } });
    await user.click(screen.getByRole('button', { name: 'Download Markdown' }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    expect(await blobText(vi.mocked(downloadBlob).mock.calls[0][0])).toBe('# Getter blocked');
    expect(savingStatus()).toHaveTextContent('Draft and filename could not be saved');
  });

  it('keeps guarded reads nonfatal when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Read blocked', 'SecurityError'); });
    render(<App />);
    expect(screen.getByLabelText('Markdown source')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Markdown source'), { target: { value: '# Still editable' } });
    expect(screen.getByRole('heading', { name: 'Still editable' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Download Markdown' })).toBeEnabled();
  });

  it('exports the latest unsaved text while leaving the last successful saved draft intact', async () => {
    window.localStorage.setItem(DRAFT_KEY, '# Earlier saved draft');
    window.localStorage.setItem(FILENAME_KEY, 'earlier');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); });
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByLabelText('Markdown source')).toHaveValue('# Earlier saved draft');
    fireEvent.change(screen.getByLabelText('Markdown source'), { target: { value: '# Latest unsaved draft\n\nKeep me.' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Filename' }), { target: { value: 'latest' } });
    await user.click(screen.getByRole('button', { name: 'Download Markdown' }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    expect(await blobText(vi.mocked(downloadBlob).mock.calls[0][0])).toBe('# Latest unsaved draft\n\nKeep me.');
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe('latest.md');
    expect(window.localStorage.getItem(DRAFT_KEY)).toBe('# Earlier saved draft');
    expect(window.localStorage.getItem(FILENAME_KEY)).toBe('earlier');
  });
});
