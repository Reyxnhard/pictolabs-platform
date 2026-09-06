import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  base: './', // CRITICAL: Enables loading relative paths from file:// in Electron
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3030,
  },
  build: {
    outDir: 'dist/renderer', // Output to dist/renderer to keep separate from main process
    emptyOutDir: true,
  }
});
