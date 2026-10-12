/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative asset paths ('./') let the same build work on GitHub Pages
// (https://sriharshachava.github.io/Chitra/), on the local preview server, or any other folder.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // Listen on the local network so an iPad on the same Wi-Fi can open the dev server.
    host: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
