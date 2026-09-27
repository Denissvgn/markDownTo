import { describe, expect, it } from 'vitest';
import { exportToXml } from './xmlExporter';

describe('xmlExporter', () => {
  it('converts markdown to structured XML', () => {
    const markdown = `# Document Title

This is a paragraph with **bold** and *italic* text.

- Item 1
- Item 2
`;
    const title = 'Document Title';
    const date = new Date('2026-05-26T21:00:00.000Z');
    const xml = exportToXml(markdown, title, date);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<title>Document Title</title>');
    expect(xml).toContain('<generated-at>2026-05-26T21:00:00.000Z</generated-at>');
    expect(xml).toContain('<heading level="1">Document Title</heading>');
    expect(xml).toContain('<paragraph>This is a paragraph with <bold>bold</bold> and <italic>italic</italic> text.</paragraph>');
    expect(xml).toContain('<list type="unordered">');
    expect(xml).toContain('<item><paragraph>Item 1</paragraph>');
  });
});
