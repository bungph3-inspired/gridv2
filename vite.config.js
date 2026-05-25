// Vite + Tailwind v4 config.
//
// Tailwind v4 ships an official Vite plugin (@tailwindcss/vite). It replaces
// the v3 PostCSS pipeline — no postcss.config.js, no tailwind.config.js needed.
// Theme tokens, content scanning, and utility generation all happen via the
// CSS file (src/style.css) using @import "tailwindcss" and @theme {...}.

import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [tailwindcss()],
  // Multi-page: index.html (desktop) + index_mobile.html (mobile) + agent.html.
  server: {
    port: 5173,
    open: true,
    // Dev-only proxy so the frontend can call /api/* same-origin and the
    // session cookie (Secure + SameSite=Lax) is delivered cleanly. The API
    // listens on localhost:3000 (Hono via @hono/node-server). In prod the
    // frontend uses an absolute https://api.azuresb.com URL — see
    // src/agent-main.js apiBase().
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main:   resolve(__dirname, 'index.html'),
        mobile: resolve(__dirname, 'index_mobile.html'),
        agent:  resolve(__dirname, 'agent.html'),
      },
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
});