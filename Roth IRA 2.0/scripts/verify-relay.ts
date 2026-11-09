/**
 * Checks for the AI relay, with OpenAI replaced by a stand-in: no network, no
 * cost. Above all, that its limits hold and the key isn't echoed back.
 * Run with:  npm run verify:relay
 */

import { createAiRelay, openAiKeyFrom, openAiModelFrom } from '../aiRelay';

let passed = 0;
let failed = 0;

const check = (name: string, condition: boolean, detail = '') => {
  if (condition) {
    passed++;
    console.log(`ok   ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? `  — ${detail}` : ''}`);
  }
};

const realFetch = globalThis.fetch;
const realError = console.error;
console.error = () => {};

const main = async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  let reply: () => Promise<Response> = async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"item":1}' } }] }));
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return reply();
  }) as typeof fetch;

  const relay = createAiRelay({ apiKey: 'sk-test-secret', model: 'test-model', requestsPerWindow: 2 });
  check('enabled when there is a key', relay.enabled);

  const off = createAiRelay({ apiKey: '', model: 'm' });
  check('no key: disabled, and answers 503', !off.enabled && (await off.chat({ prompt: 'x' }, 'a')).status === 503);
  check('no key: never calls OpenAI', calls.length === 0);

  check('a missing prompt is refused', (await relay.chat({}, 'a')).status === 400);
  check('a non-object body is refused', (await relay.chat(null, 'a')).status === 400);
  check('an oversized prompt is refused', (await relay.chat({ prompt: 'x'.repeat(20_001) }, 'a')).status === 413);
  check('an oversized system prompt is refused', (await relay.chat({ prompt: 'x', system: 'y'.repeat(20_001) }, 'a')).status === 413);
  check('refused requests never reach OpenAI', calls.length === 0);

  const ok = await relay.chat({ system: 's', prompt: 'hello' }, 'a');
  check('a good request returns the model’s content', ok.status === 200 && ok.body.content === '{"item":1}');
  const sent = JSON.parse(String(calls[0].init.body));
  check('it goes to OpenAI with the key and model', calls[0].url.includes('api.openai.com') && (calls[0].init.headers as Record<string, string>).Authorization === 'Bearer sk-test-secret' && sent.model === 'test-model');
  check('it passes the prompts along', sent.messages[0].content === 's' && sent.messages[1].content === 'hello');
  check('it can’t hang forever', calls[0].init.signal instanceof AbortSignal);
  check('the reply carries no key', !JSON.stringify(ok.body).includes('sk-test'));

  await relay.chat({ prompt: 'second' }, 'a');
  const before = calls.length;
  check('past the limit: refused', (await relay.chat({ prompt: 'third' }, 'a')).status === 429);
  check('past the limit: OpenAI isn’t called', calls.length === before);
  check('another visitor has their own limit', (await relay.chat({ prompt: 'x' }, 'b')).status === 200);

  reply = async () => new Response(JSON.stringify({ error: { message: 'bad key sk-test-secret' } }), { status: 401 });
  const denied = await relay.chat({ prompt: 'x' }, 'c');
  check('an OpenAI error keeps its status', denied.status === 401);
  check('an OpenAI error doesn’t echo what it said', !JSON.stringify(denied.body).includes('sk-test'));

  reply = async () => { throw new Error('network down'); };
  check('can’t reach OpenAI: answers 502', (await relay.chat({ prompt: 'x' }, 'd')).status === 502);

  check('key: the plain name', openAiKeyFrom({ OPENAI_API_KEY: ' abc ' }) === 'abc');
  check('key: the old name still works on the server', openAiKeyFrom({ VITE_OPENAI_API_KEY: 'abc' }) === 'abc');
  check('key: the example placeholder counts as none', openAiKeyFrom({ OPENAI_API_KEY: 'MY_OPENAI_API_KEY' }) === '');
  check('model: default when unset', openAiModelFrom({}) === 'gpt-4.1-mini');
};

main().finally(() => {
  globalThis.fetch = realFetch;
  console.error = realError;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
});
