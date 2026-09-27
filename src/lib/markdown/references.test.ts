import type { ImageReference, LinkReference, Nodes } from 'mdast';
import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './parser';
import { collectReferenceDefinitions, resolveReference } from './references';

function references(root: Nodes): Array<LinkReference | ImageReference> {
  if (root.type === 'linkReference' || root.type === 'imageReference') return [root];
  return 'children' in root ? root.children.flatMap(references) : [];
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}

describe('reference model', () => {
  it.each([
    ['[**Label**][target]', 'link', 'full'],
    ['[target][]', 'link', 'collapsed'],
    ['[target]', 'link', 'shortcut'],
    ['![Image alt][target]', 'image', 'full'],
    ['![target][]', 'image', 'collapsed'],
    ['![target]', 'image', 'shortcut']
  ])('resolves %s without dropping metadata or mutating the tree', (source, type, referenceType) => {
    const root = freeze(parseMarkdown(`${source}\n\n[target]: https://example.test/resource "A & title"`));
    const before = JSON.stringify(root);
    const [node] = references(root);
    expect(node.referenceType).toBe(referenceType);
    const resolved = resolveReference(node, collectReferenceDefinitions(root));
    expect(resolved).toMatchObject({ type, url: 'https://example.test/resource', title: 'A & title' });
    if (node.type === 'linkReference') {
      expect(resolved).toHaveProperty('children', node.children);
      if (resolved?.type === 'link') expect(resolved.children).not.toBe(node.children);
    } else {
      expect(resolved).toHaveProperty('alt', node.alt);
    }
    expect(JSON.stringify(root)).toBe(before);
  });

  it('uses parser-normalized whitespace/case identifiers and the first definition in document order', () => {
    const root = parseMarkdown('[Docs][MiXeD  ID]\n\n> [mixed id]: https://example.test/first "First"\n\n[MIXED ID]: https://example.test/second');
    const definitions = collectReferenceDefinitions(root);
    expect(definitions.size).toBe(1);
    expect(resolveReference(references(root)[0], definitions)).toMatchObject({ url: 'https://example.test/first', title: 'First' });
  });

  it('reuses the parser’s Unicode case folding instead of lowercasing raw labels', () => {
    const root = parseMarkdown('[straße]\n\n[STRASSE]: https://example.test/unicode');
    expect(resolveReference(references(root)[0], collectReferenceDefinitions(root))).toMatchObject({ url: 'https://example.test/unicode' });
  });

  it('treats object-property-like identifiers as ordinary map keys', () => {
    const root = parseMarkdown('[safe][__proto__]\n\n[__proto__]: https://example.test/safe');
    expect(resolveReference(references(root)[0], collectReferenceDefinitions(root))).toMatchObject({ url: 'https://example.test/safe' });
  });

  it('does not treat literal code definitions or a previous document as definitions', () => {
    const first = parseMarkdown('[target]\n\n[target]: https://example.test/first');
    expect(collectReferenceDefinitions(first).size).toBe(1);
    const second = parseMarkdown('```markdown\n[target]: https://example.test/literal\n```\n\n[target]');
    expect(collectReferenceDefinitions(second).size).toBe(0);
    expect(references(second)).toEqual([]);
  });

  it('retains the parser’s null representation of an empty title', () => {
    const root = parseMarkdown('[target]\n\n[target]: https://example.test/empty ""');
    expect(resolveReference(references(root)[0], collectReferenceDefinitions(root))?.title).toBeNull();
  });

  it('preserves an explicitly empty title supplied in an AST', () => {
    const reference: LinkReference = { type: 'linkReference', identifier: 'target', referenceType: 'shortcut', children: [{ type: 'text', value: 'target' }] };
    const definitions = collectReferenceDefinitions({ type: 'root', children: [{ type: 'definition', identifier: 'target', url: '/target', title: '' }] });
    expect(resolveReference(reference, definitions)?.title).toBe('');
  });

  it('returns null for synthetic unresolved nodes and leaves real unresolved syntax literal', () => {
    const definitions = collectReferenceDefinitions(parseMarkdown(''));
    const link: LinkReference = { type: 'linkReference', identifier: 'missing', referenceType: 'full', children: [{ type: 'text', value: 'Readable label' }] };
    const image: ImageReference = { type: 'imageReference', identifier: 'missing', referenceType: 'full', alt: 'Readable alt' };
    expect(resolveReference(link, definitions)).toBeNull();
    expect(resolveReference(image, definitions)).toBeNull();
    const root = parseMarkdown('[Missing][absent]\n\n![Missing][absent]');
    expect(references(root)).toEqual([]);
    expect(JSON.stringify(root)).toContain('[Missing][absent]');
  });
});
