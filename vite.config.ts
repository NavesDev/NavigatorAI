import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';

import manifest from './src/manifest';

export default defineConfig({
  plugins: [
    react(),
    webExtension({
      manifest: () => manifest,
      disableAutoLaunch: true,
    }),
  ],
});
