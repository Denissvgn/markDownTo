import { describe, expect, it } from 'vitest';
import { escapeHtmlAttribute, escapeHtmlText, safeDestination } from './serializationSafety';
import type { DestinationKind } from './serializationSafety';

const kinds: DestinationKind[] = ['link', 'image'];

const sharedSafeDestinations = [
  'https://example.test/docs?q=one&next=two#section',
  'http://example.test/image.png',
  'HTTPS://example.test/Case',
  '/assets/image.svg#icon',
  './notes:old',
  '../images/logo.png',
  'images/logo.png?size=2',
  'café/a%20b.png',
  'https://example.test/a%2Fb?q=%26%23javascript%3A',
  'javascript%3Aexample.png',
  'https://example.test/a b.png'
];

const rejectedDestinations = [
  '', '   ',
  'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1) ',
  'vbscript:msgbox(1)',
  'data:text/html,<script>alert(1)</script>',
  'data:image/svg+xml,<svg onload="alert(1)"></svg>',
  'data:image/png;base64,AAAA',
  'blob:https://example.test/identifier',
  'file:///tmp/document.html', 'ftp://example.test/file', 'custom:example',
  '//example.test/path', '///example.test/path', ' //example.test/path ',
  '\\\\example.test/path', '/\\example.test/path', 'https:\\example.test/path',
  'java\tscript:alert(1)', 'java\nscript:alert(1)', 'java\rscript:alert(1)',
  '\u0000javascript:alert(1)', 'https://example.test/\u007fimage.png',
  'https://example.test/\timage.png',
  'java%73cript:alert(1)', 'java%0ascript:alert(1)',
  'https://', 'http://[invalid'
];

describe.each(kinds)('safeDestination for %s', (kind) => {
  it.each(sharedSafeDestinations)('retains a safe destination: %s', (destination) => {
    expect(safeDestination(destination, kind)).toBe(destination);
  });

  it.each(rejectedDestinations)('rejects an unsafe or malformed destination: %j', (destination) => {
    expect(safeDestination(destination, kind)).toBeNull();
  });

  it('trims surrounding spaces without rewriting encoded paths or queries', () => {
    expect(safeDestination('  https://example.test/a%2Fb?q=%26  ', kind))
      .toBe('https://example.test/a%2Fb?q=%26');
  });
});

describe('link/image policy differences', () => {
  it.each(['mailto:reader@example.test?subject=A%20B', '#section', '?page=2&mode=read'])('allows %s only for links', (destination) => {
      expect(safeDestination(destination, 'link')).toBe(destination);
      expect(safeDestination(destination, 'image')).toBeNull();
    });
});

describe('HTML serialization escaping', () => {
  it('keeps markup and entity-looking input as literal text', () => {
    const value = '<svg onload="alert(1)"> &lt;tag&gt; & "quotes" \'apostrophe\'';
    const document = new DOMParser().parseFromString(`<p>${escapeHtmlText(value)}</p>`, 'text/html');
    expect(document.querySelector('p')?.textContent).toBe(value);
    expect(document.querySelector('svg, script, tag')).toBeNull();
  });

  it.each(['"', "'"])('round-trips values inside a %s-quoted attribute', (quote) => {
    const value = `" onload="alert(1)" '><svg/onload=alert(2)> &quot; &#x27; &next=1`;
    const html = `<img alt=${quote}${escapeHtmlAttribute(value)}${quote}>`;
    const document = new DOMParser().parseFromString(html, 'text/html');
    const image = document.querySelector('img');
    expect(image?.getAttribute('alt')).toBe(value);
    expect(image?.getAttributeNames()).toEqual(['alt']);
    expect(document.querySelector('svg, script')).toBeNull();
  });

  it('does not decode entity-looking destinations a second time', () => {
    const destination = 'https://example.test/?value=&colon;&next=%26%23x3a%3B';
    const safe = safeDestination(destination, 'link');
    expect(safe).toBe(destination);
    const document = new DOMParser().parseFromString(`<a href="${escapeHtmlAttribute(safe!)}">safe</a>`, 'text/html');
    expect(document.querySelector('a')?.getAttribute('href')).toBe(destination);
  });
});
