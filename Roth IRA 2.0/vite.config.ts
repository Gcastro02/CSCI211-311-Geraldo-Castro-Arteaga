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
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/stooq-api': {
          target: 'https://stooq.com',
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/stooq-api/, ''),
        },
        '/yahoo-api': {
          target: 'https://query1.finance.yahoo.com',
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/yahoo-api/, ''),
        },
      },
    },
  };
});
