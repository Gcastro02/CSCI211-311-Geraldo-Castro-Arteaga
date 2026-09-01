/**
 * Production server for the built app.
 *
 * `vite dev` proxies Yahoo through its own dev server (see vite.config.ts),
 * which is why market data works locally. A plain static build has no such
 * proxy, so the browser calls Yahoo directly and every request dies on CORS —
 * Yahoo sends no `Access-Control-Allow-Origin`. This server reproduces the dev
 * proxy for production and serves the built assets.
 *
 * It also offers an optional AI relay: set OPENAI_API_KEY (no VITE_ prefix) and
 * the key stays on the server instead of being compiled into the client bundle,
 * where anyone viewing the page could read it.
 *
 *   npm run build && npm run serve
 */

import express, { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const DIST_DIR = path.join(__dirname, 'dist');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

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
          'User-Agent': 'Mozilla/5.0 (compatible; RothIRAStrategist/2.0)',
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

/**
 * Server-side OpenAI relay. The client posts a prompt; the key never leaves here.
 * Returns 503 when unconfigured so the UI can disable AI features cleanly.
 */
app.post('/api/ai/chat', async (req: Request, res: Response) => {
  if (!OPENAI_API_KEY) {
    return res.status(503).json({ error: 'AI relay is not configured. Set OPENAI_API_KEY on the server.' });
  }

  const { system, prompt } = req.body ?? {};
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'A "prompt" string is required.' });
  }

  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: typeof system === 'string' ? system : '' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      }),
    });

    const payload = await upstream.json();

    if (!upstream.ok) {
      // Pass the status through but not the body — it can echo key metadata.
      console.error('OpenAI request failed:', upstream.status, payload);
      return res.status(upstream.status).json({ error: `OpenAI request failed (${upstream.status}).` });
    }

    res.json({ content: payload?.choices?.[0]?.message?.content ?? '' });
  } catch (error) {
    console.error('OpenAI relay failed:', error);
    res.status(502).json({ error: 'Could not reach OpenAI.' });
  }
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
  console.log(`Roth IRA Portfolio Strategist listening on http://localhost:${PORT}`);
  console.log(`  market data proxies: /stooq-api, /yahoo-api`);
  console.log(`  AI relay: ${OPENAI_API_KEY ? 'enabled' : 'disabled (set OPENAI_API_KEY)'}`);
});
