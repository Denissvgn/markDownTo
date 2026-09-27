import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { clientDocxExporter } from './lib/export/clientDocxExporter';
import { exportToXml } from './lib/export/xmlExporter';

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('updates the preview as markdown changes', async () => {
    const user = userEvent.setup();
    render(<App />);

    const editor = screen.getByLabelText('Markdown source');
    await user.clear(editor);
    await user.type(editor, '# Draft\n\n| A | B |\n| --- | --- |\n| 1 | 2 |');

    expect(screen.getByRole('heading', { name: 'Draft' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('imports markdown files and persists the filename base', async () => {
    const { container } = render(<App />);
    const input = container.querySelector('input[type="file"]');

    expect(input).toBeInstanceOf(HTMLInputElement);

    const file = new File(['# Imported\n\nImported body'], 'imported.md', { type: 'text/markdown' });
    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByLabelText('Markdown source')).toHaveValue('# Imported\n\nImported body'));
    expect(screen.getByLabelText('Rendered markdown preview')).toHaveTextContent('Imported body');
    expect(screen.getByDisplayValue('imported')).toBeInTheDocument();
  });

  it('imports HTML files as Markdown', async () => {
    const { container } = render(<App />);
    const input = container.querySelector('input[type="file"]');

    const file = new File(['<h1>HTML Import</h1><p>Imported <strong>body</strong></p>'], 'html-import.html', {
      type: 'text/html'
    });
    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByLabelText('Markdown source')).toHaveValue('# HTML Import\n\nImported **body**\n'));
    expect(screen.getByRole('heading', { name: 'HTML Import' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('html-import')).toBeInTheDocument();
  });

  it('imports MarkdownTo XML files as Markdown', async () => {
    const { container } = render(<App />);
    const input = container.querySelector('input[type="file"]');
    const xml = exportToXml('# XML Import\n\nImported XML body', 'XML Import', new Date('2026-05-26T21:00:00.000Z'));
    const file = new File([xml], 'xml-import.xml', { type: 'application/xml' });

    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByLabelText('Markdown source')).toHaveValue('# XML Import\n\nImported XML body\n'));
    expect(screen.getByRole('heading', { name: 'XML Import' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('xml-import')).toBeInTheDocument();
  });

  it('imports DOCX files as Markdown', async () => {
    const { container } = render(<App />);
    const input = container.querySelector('input[type="file"]');
    const blob = await clientDocxExporter.export({
      markdown: '# DOCX Import\n\nImported **DOCX** body',
      filenameBase: 'docx-import',
      title: 'DOCX Import',
      generatedAt: new Date('2026-05-22T00:00:00Z')
    });
    const file = new File([blob], 'docx-import.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });

    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });

    await waitFor(() => expect((screen.getByLabelText('Markdown source') as HTMLTextAreaElement).value).toContain('DOCX Import'));
    expect((screen.getByLabelText('Markdown source') as HTMLTextAreaElement).value).toContain('**DOCX**');
    expect(screen.getByDisplayValue('docx-import')).toBeInTheDocument();
  });

  it('leaves the editor unchanged when an import is unsupported', async () => {
    const { container } = render(<App />);
    const input = container.querySelector('input[type="file"]');
    const editor = screen.getByLabelText('Markdown source') as HTMLTextAreaElement;
    const originalMarkdown = editor.value;
    const file = new File(['not supported'], 'document.pdf', { type: 'application/pdf' });

    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/Unsupported import file: document.pdf/)).toBeInTheDocument());
    expect(editor.value).toBe(originalMarkdown);
  });

  it('loads stored source verbatim and offers explicit table conversion', () => {
    window.localStorage.setItem(
      'markdown-to:draft',
      '# Stored\n\n<table class="confluenceTable"><tbody><tr><th>Key</th><th>Val</th></tr><tr><td>A</td><td>B</td></tr></tbody></table>'
    );

    render(<App />);

    const editor = screen.getByLabelText('Markdown source') as HTMLTextAreaElement;
    expect(editor.value).toBe(window.localStorage.getItem('markdown-to:draft'));
    expect(editor.value).toContain('<table');
    expect(screen.getByRole('button', { name: 'Convert HTML Tables' })).toBeVisible();
  });

  it('shows Convert HTML Tables button and converts embedded tables on click', async () => {
    const user = userEvent.setup();
    render(<App />);

    const editor = screen.getByLabelText('Markdown source');
    await user.clear(editor);

    fireEvent.change(editor, {
      target: {
        value: '# Title\n\n<table><tbody><tr><th>Col 1</th><th>Col 2</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>'
      }
    });

    const convertBtn = await screen.findByRole('button', { name: /Convert HTML Tables/i });
    expect(convertBtn).toBeInTheDocument();

    await user.click(convertBtn);

    await waitFor(() => expect(screen.getByLabelText('Markdown source')).toHaveValue('# Title\n\n| Col 1 | Col 2 |\n| --- | --- |\n| 1 | 2 |'));
  });

  it('automatically converts HTML tables when pasted into the editor', () => {
    render(<App />);

    const editor = screen.getByLabelText('Markdown source') as HTMLTextAreaElement;
    const htmlTable = '<table class="confluenceTable"><tbody><tr><th>Name</th><th>Role</th></tr><tr><td>Alice</td><td>Admin</td></tr></tbody></table>';

    fireEvent.paste(editor, {
      clipboardData: {
        getData: (format: string) => (format === 'text/html' ? htmlTable : '')
      }
    });

    expect(editor.value).toContain('| Name | Role |');
    expect(editor.value).not.toContain('<table');
  });
});
