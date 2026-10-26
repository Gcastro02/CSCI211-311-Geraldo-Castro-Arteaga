/**
 * The OpenAI relay, shared by the dev server (vite.config.ts) and the
 * production server (server.ts). The browser posts a prompt to /api/ai/chat
 * and the key stays here, on the server, in both cases: nothing with the key
 * is ever compiled into the page.
 *
 * Node-only. Never import this from src/.
 */

export interface AiRelayOptions {
  apiKey: string;
  model: string;
  /** Requests each visitor may make per window. */
  requestsPerWindow?: number;
}

export interface RelayResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Every relayed request is billed to the key, and the endpoint answers anyone
 * who can reach it. These caps keep a stranger (or a stuck client) from
 * running up the bill: a handful of requests per visitor per window, and
 * prompts no longer than the app's own, which stay well under 10,000 characters.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PROMPT_CHARS = 20_000;

export const createAiRelay = ({ apiKey, model, requestsPerWindow = 30 }: AiRelayOptions) => {
  const requestLog = new Map<string, number[]>();

  const allow = (visitor: string): boolean => {
    const now = Date.now();
    const recent = (requestLog.get(visitor) ?? []).filter(t => now - t < WINDOW_MS);
    if (recent.length >= requestsPerWindow) {
      requestLog.set(visitor, recent);
      return false;
    }
    recent.push(now);
    requestLog.set(visitor, recent);
    // Forget visitors who have gone quiet so the map doesn't grow without bound.
    if (requestLog.size > 10_000) {
      for (const [key, times] of requestLog) {
        if (times.every(t => now - t >= WINDOW_MS)) requestLog.delete(key);
      }
    }
    return true;
  };

  const chat = async (body: unknown, visitor: string): Promise<RelayResponse> => {
    if (!apiKey) {
      return { status: 503, body: { error: 'AI is not configured. Set OPENAI_API_KEY in .env and restart.' } };
    }

    const { system, prompt } = (body ?? {}) as { system?: unknown; prompt?: unknown };
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return { status: 400, body: { error: 'A "prompt" string is required.' } };
    }
    if (prompt.length > MAX_PROMPT_CHARS || (typeof system === 'string' && system.length > MAX_PROMPT_CHARS)) {
      return { status: 413, body: { error: 'That request is too long.' } };
    }
    if (!allow(visitor)) {
      return { status: 429, body: { error: 'Too many AI requests. Try again in a few minutes.' } };
    }

    try {
      const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
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
        console.error('OpenAI request failed:', upstream.status, payload?.error?.message ?? '');
        return { status: upstream.status, body: { error: `OpenAI request failed (${upstream.status}).` } };
      }

      return { status: 200, body: { content: payload?.choices?.[0]?.message?.content ?? '' } };
    } catch (error) {
      console.error('OpenAI relay failed:', error);
      return { status: 502, body: { error: 'Could not reach OpenAI.' } };
    }
  };

  return { enabled: Boolean(apiKey), chat };
};

/**
 * The key from the environment. The old VITE_-prefixed name still works here,
 * on the server, so an existing .env keeps working — but only the server reads
 * it; the page never does.
 */
export const openAiKeyFrom = (env: Record<string, string | undefined>): string => {
  const key = (env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || '').trim();
  return ['MY_OPENAI_API_KEY', 'YOUR_OPENAI_API_KEY'].includes(key) ? '' : key;
};

export const openAiModelFrom = (env: Record<string, string | undefined>): string =>
  env.OPENAI_MODEL || env.VITE_OPENAI_MODEL || 'gpt-4.1-mini';
