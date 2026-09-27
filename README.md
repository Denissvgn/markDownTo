# MarkdownTo

A browser editor with live GitHub-flavored Markdown preview, tables, task lists and syntax highlighting.

Import Markdown/plain text (`.md`, `.markdown`, `.txt`), DOCX, HTML or MarkdownTo XML. Download Markdown, DOCX, HTML or XML. PDF is not implemented. Drafts, filenames and theme preferences are saved in browser-local storage when available.

## Setup and checks

Use **Node 24.21.0** and **npm 11.19.0** (`nvm install && nvm use` with nvm).

```sh
npm ci
npm run test:browser:install
npm run dev
```

Open the local URL printed by Vite. Stop the development server before running the checks:

```sh
npm run build
npm run lint
npm test
npm run test:e2e:production
```

See [development and verification](docs/development.md) for Linux browser dependencies, toolchain details and the optional development-server smoke suite. See [document handling](docs/usage.md) for recovery, storage cleanup, remote-image requests, conversion limits and the custom XML format. Conversion happens in the browser, but remote images can make network requests; document and visual fidelity depend on the format.

## License

[MIT](LICENSE) © 2026 Denissvgn.
