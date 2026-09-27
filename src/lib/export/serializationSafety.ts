export type DestinationKind = 'link' | 'image';

const VALIDATION_BASE = 'https://markdown-to.invalid/';

/**
 * Validate a destination after Markdown parsing, before attribute escaping.
 * Links allow HTTP(S), mailto, relative paths, queries, and fragments. Images
 * allow HTTP(S) and relative paths, but not an empty/current-document source.
 * Protocol-relative URLs, backslashes, raw controls, and other schemes are
 * rejected. Percent escapes and HTML entities are never decoded here: doing
 * so would change safe path/query semantics or introduce a second decode.
 */
export function safeDestination(destination: string, kind: DestinationKind): string | null {
  for (const character of destination) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return null;
  }

  const value = destination.trim();
  if (!value || value.includes('\\') || value.startsWith('//')) return null;
  if (kind === 'image' && (value.startsWith('#') || value.startsWith('?'))) return null;

  // A relative path's first segment must not masquerade as an encoded scheme.
  const firstSegment = value.split(/[/?#]/, 1)[0];
  if (firstSegment.includes(':') && !/^[a-z][a-z\d+.-]*:/i.test(value)) return null;

  try {
    const { protocol } = new URL(value, VALIDATION_BASE);
    if (protocol === 'http:' || protocol === 'https:' || (kind === 'link' && protocol === 'mailto:')) {
      return value;
    }
  } catch {
    // Malformed URLs have the same inert fallback as disallowed schemes.
  }
  return null;
}

export function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escape a value for a single- or double-quoted HTML attribute. */
export function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
