import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify; file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        // Yahoo sends no CORS headers, so browser requests must be relayed.
        // server.ts mirrors this proxy for production builds.
        '/yahoo-api': {
          target: 'https://query1.finance.yahoo.com',
          changeOrigin: true,
          // Without a browser-like User-Agent, Yahoo answers 429 Too Many
          // Requests almost immediately and every chart comes back empty.
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; RothIRAStrategist/2.0)',
          },
          rewrite: (requestPath) => requestPath.replace(/^\/yahoo-api/, ''),
        },
      },
    },
  };
});
