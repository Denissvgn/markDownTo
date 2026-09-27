# Working with documents

MarkdownTo imports Markdown/plain text (`.md`, `.markdown`, `.txt`), DOCX, HTML (`.html`, `.htm`), and its own XML dialect. Downloads are Markdown, DOCX, HTML and XML. PDF is not implemented. Imports replace the current editor document; a failed import keeps the previous draft and filename.

## Saving and recovery

The app stores the draft, filename and theme in this browser's local storage, separately for each site origin. This is not an account, cloud backup or synchronization service. Private browsing, browser cleanup, storage limits and site changes can remove or prevent access to saved data.

A storage warning means the latest work may exist only in the open tab. Download Markdown before closing or reloading, then use **Retry saving** after resolving the browser's storage restriction. Export success does not mean autosave succeeded. The previous-document controls keep one in-memory document after an import, sample replacement, conversion or handled paste. Restore swaps the two documents; download preserves the previous source separately. Converted Markdown imports also offer the original imported text. These recovery copies expire when the tab closes or another operation replaces them.

To clear only this app's saved data, first download anything you need. In browser developer tools, open Application (or Storage) → Local Storage → this site's origin and delete `markdown-to:draft`, `markdown-to:filename` and `markdown-to:theme`. Close other tabs of the app, then reload immediately without further editing. Alternatively, clearing all site data removes these keys but also other data on the same origin. Removing storage does not delete downloaded files.

## Network and conversion limits

Conversion runs in the browser; the application has no document-upload service. This does not mean all use is offline or network-free: loading the hosted app and previewing or exporting remote images can make requests. Remote servers receive ordinary request information. Image export depends on availability and cross-origin access (CORS); offline, inaccessible or unsupported images can fail or fall back. Saved HTML can request linked images when opened. Relative URLs resolve against the location where a document is displayed, so moving it can change its destinations.

DOCX imports replace embedded images with text placeholders and warnings. Layout, fonts, page breaks, styles and other Word features do not have exact Markdown equivalents. HTML imports discard unsafe/unsupported content and convert supported structure; standalone embedded HTML tables in Markdown can be converted, while code and ambiguous table regions remain literal. Read conversion warnings and compare important documents with their originals. The status line shows a warning count and the first warning, not every individual warning.

Raw HTML in Markdown is ignored by the preview and the HTML/XML serializers; HTML file import is a separate conversion path. Do not treat arbitrary raw HTML as portable document content. HTML/XML export accepts HTTP(S) and relative destinations, with `mailto:` also allowed for links and query/fragment-only links allowed. Image destinations cannot be empty or query/fragment-only. Protocol-relative URLs, backslashes, control characters and schemes such as `javascript:`, `data:`, `blob:` and `file:` are rejected by these serializers. Rejected links retain their label; rejected images retain alt text. This policy is specific to HTML/XML export, not a claim that every downstream document viewer uses the same rules.

The automated browser evidence covers managed Chromium on Linux and small synthetic documents, including saved-file parsing, references, recovery and blocked storage. Word/LibreOffice visual fidelity, other browser/OS combinations, large documents, memory limits and performance remain unqualified. DOCX ZIP/content checks do not establish page-layout fidelity.

## MarkdownTo XML

This is a custom, case-sensitive dialect, not arbitrary XML, Word XML or a general interchange standard. See the runnable [example](examples/document.xml). Import requires a well-formed `<document>` root with a direct `<content>` child. Malformed XML or another schema is rejected without replacing the draft. No XSD validation is performed.

| Structure | Supported content / attributes |
| --- | --- |
| `document` | `metadata` and `content`; import reads `content` |
| `metadata` | `title`, `generated-at` (export time as ISO 8601 UTC); import ignores metadata and uses the imported filename |
| `heading` | Inline content; `level` clamped to 1–6 (default 1) |
| `paragraph`, `blockquote` | Inline content, or block children for blockquotes |
| `bold`, `italic`, `strike`, `code-inline` | Inline formatting; code preserves literal text |
| `link` | Inline label; `url`, optional `title` |
| `image` | `url`, `alt`, optional `title`; images are references, not embedded data |
| `list` / `item` | `type="ordered"` or `"unordered"`, optional ordered `start`; item `checked="true"` or `"false"` for tasks; block children |
| `table` | `header` with `cell` children; optional `body` with `row` / `cell` children; inline cell content |
| `code-block` | Literal text; optional `language` |
| `break`, `horizontal-rule` | Hard line break and thematic break |

Unknown content tags produce warnings and fall back to text/recognized inline children; they are not preserved as arbitrary XML. A table without header cells is skipped with a warning. Unrecognized attributes are ignored. Table alignment, source whitespace, reference-definition spelling and metadata are not exact round trips. Escape XML characters (`&amp;`, `&lt;`, etc.) normally. Supported link/image references in Markdown become explicit XML destinations; HTML/XML exports apply the destination policy above. Importing a destination into source does not mean it will pass that export policy.
