import type { Definition, Image, ImageReference, Link, LinkReference, Nodes } from 'mdast';

type ReferenceDefinition = Readonly<Pick<Definition, 'url' | 'title'>>;
export type ReferenceDefinitions = ReadonlyMap<string, ReferenceDefinition>;

/** Collect once in source order. mdast's parser already normalizes identifiers
 * (including whitespace and Unicode case folding); first definition wins. */
export function collectReferenceDefinitions(root: Nodes): ReferenceDefinitions {
  const definitions = new Map<string, ReferenceDefinition>();
  const pending: Nodes[] = [root];
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (node.type === 'definition' && !definitions.has(node.identifier)) {
      definitions.set(node.identifier, { url: node.url, title: node.title });
    }
    if ('children' in node) {
      for (let index = node.children.length - 1; index >= 0; index -= 1) pending.push(node.children[index]);
    }
  }
  return definitions;
}

/** Return a normal link/image without changing the parsed tree. Unknown
 * references return null: serializers retain their readable label/alt text.
 * Ordinary unresolved Markdown is already literal text in the parser's tree. */
export function resolveReference(node: LinkReference | ImageReference, definitions: ReferenceDefinitions): Link | Image | null {
  const definition = definitions.get(node.identifier);
  if (!definition) return null;
  return node.type === 'linkReference'
    ? { type: 'link', url: definition.url, title: definition.title, children: [...node.children] }
    : { type: 'image', url: definition.url, title: definition.title, alt: node.alt };
}
