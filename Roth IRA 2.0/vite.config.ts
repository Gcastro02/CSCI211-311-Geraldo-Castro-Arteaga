import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';
import {createAiRelay, openAiKeyFrom, openAiModelFrom} from './aiRelay';

// Without a browser-like User-Agent, Yahoo answers 429 Too Many Requests
// almost immediately and every chart comes back empty.
const YAHOO_HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; PaperTrail/2.0)'};

/**
 * The AI relay during `npm run dev`, the same one server.ts runs in
 * production. The key is read here, in Node, and never reaches the page.
 */
const aiRelayPlugin = (env: Record<string, string>): Plugin => ({
  name: 'ai-relay',
  configureServer(server) {
    const relay = createAiRelay({apiKey: openAiKeyFrom(env), model: openAiModelFrom(env)});
    server.middlewares.use('/api/ai/status', (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({enabled: relay.enabled}));
    });
    server.middlewares.use('/api/ai/chat', (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end();
        return;
      }
      let raw = '';
      req.on('data', chunk => { raw += chunk; });
      req.on('end', async () => {
        let body: unknown = null;
        try {
          body = JSON.parse(raw);
        } catch {
          // Left null; the relay answers 400.
        }
        const {status, body: reply} = await relay.chat(body, req.socket.remoteAddress ?? 'local');
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(reply));
      });
    });
  },
});

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), aiRelayPlugin(env)],
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
        // server.ts mirrors these proxies for production builds.
        '/yahoo-api': {
          target: 'https://query1.finance.yahoo.com',
          changeOrigin: true,
          headers: YAHOO_HEADERS,
          rewrite: (requestPath) => requestPath.replace(/^\/yahoo-api/, ''),
        },
        // Yahoo's free per-ticker RSS: the same headlines, with a one-line summary each.
        '/yahoo-rss': {
          target: 'https://feeds.finance.yahoo.com',
          changeOrigin: true,
          headers: YAHOO_HEADERS,
          rewrite: (requestPath) => requestPath.replace(/^\/yahoo-rss/, ''),
        },
      },
    },
  };
});
