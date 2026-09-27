import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import baseConfig from './playwright.config';

const baseURL = 'http://127.0.0.1:4173';

export default defineConfig({
  ...baseConfig,
  metadata: { build: 'production' },
  use: { ...baseConfig.use, baseURL, trace: 'retain-on-failure' },
  webServer: {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    command: 'npm run build && npm exec vite -- preview --host 127.0.0.1 --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 60_000
  }
});
