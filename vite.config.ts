import react from '@vitejs/plugin-react';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  cacheDir: join(tmpdir(), 'markdown-to-vite-cache'),
  plugins: [react()],
  server: {
    watch: {
      ignored: [
        '**/.git/**',
        '**/coverage/**',
        '**/dist/**',
        '**/node_modules/**',
        '**/playwright-report/**',
        '**/test-results/**'
      ],
      interval: 300,
      usePolling: true
    }
  }
});
