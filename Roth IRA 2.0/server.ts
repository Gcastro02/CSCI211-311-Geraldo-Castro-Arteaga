/**
 * Production server for the built app.
 *
 * `vite dev` proxies Yahoo through its own dev server (see vite.config.ts),
 * which is why market data works locally. A plain static build has no such
 * proxy, so the browser calls Yahoo directly and every request dies on CORS —
 * Yahoo sends no `Access-Control-Allow-Origin`. This server reproduces the dev
 * proxy for production and serves the built assets.
 *
 * It also runs the AI relay (aiRelay.ts, shared with the dev server): set
 * OPENAI_API_KEY and the key stays on the server instead of being compiled
 * into the page, where anyone viewing it could read it.
 *
 *   npm run build && npm run serve
 */

import express, { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAiRelay, openAiKeyFrom, openAiModelFrom } from './aiRelay';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const DIST_DIR = path.join(__dirname, 'dist');

const OPENAI_API_KEY = openAiKeyFrom(process.env);
const OPENAI_MODEL = openAiModelFrom(process.env);

app.use(express.json({ limit: '1mb' }));

/**
 * Forward a request to an upstream host, preserving the path and query string.
 * Only GET is proxied — these are read-only market data endpoints.
 */
const proxyTo = (upstreamOrigin: string, stripPrefix: string) =>
  async (req: Request, res: Response) => {
    const upstreamPath = req.originalUrl.slice(stripPrefix.length) || '/';
    const upstreamUrl = `${upstreamOrigin}${upstreamPath}`;

    try {
      const upstream = await fetch(upstreamUrl, {
        headers: {
          // Yahoo rate-limits or rejects requests without a browser-ish UA.
          'User-Agent': 'Mozilla/5.0 (compatible; PaperTrail/2.0)',
          Accept: req.get('Accept') || '*/*',
        },
      });

      res.status(upstream.status);
      const contentType = upstream.headers.get('content-type');
      if (contentType) res.set('Content-Type', contentType);

      res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      console.error(`Proxy request to ${upstreamUrl} failed:`, error);
      res.status(502).json({ error: 'Upstream request failed' });
    }
  };

app.get('/yahoo-api/*', proxyTo('https://query1.finance.yahoo.com', '/yahoo-api'));
// Yahoo's free per-ticker RSS: the same headlines, with a one-line summary each.
app.get('/yahoo-rss/*', proxyTo('https://feeds.finance.yahoo.com', '/yahoo-rss'));

const aiRelay = createAiRelay({
  apiKey: OPENAI_API_KEY,
  model: OPENAI_MODEL,
  requestsPerWindow: Number(process.env.AI_REQUESTS_PER_WINDOW) || undefined,
});

/** Whether AI is set up, so the page shows AI buttons only when they'd work. */
app.get('/api/ai/status', (_req: Request, res: Response) => {
  res.json({ enabled: aiRelay.enabled });
});

/** Server-side OpenAI relay. The client posts a prompt; the key never leaves here. */
app.post('/api/ai/chat', async (req: Request, res: Response) => {
  const { status, body } = await aiRelay.chat(req.body, req.ip ?? 'unknown');
  res.status(status).json(body);
});

app.get('/healthz', (_req: Request, res: Response) => {
  res.json({ ok: true, aiRelay: Boolean(OPENAI_API_KEY) });
});

app.use(express.static(DIST_DIR));

// Single-page app: hand every unmatched GET back to index.html.
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Paper Trail listening on http://localhost:${PORT}`);
  console.log(`  market data proxies: /yahoo-api, /yahoo-rss`);
  console.log(`  AI relay: ${OPENAI_API_KEY ? 'enabled' : 'disabled (set OPENAI_API_KEY)'}`);
});
