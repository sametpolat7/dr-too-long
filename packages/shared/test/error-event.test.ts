import { APICallError, StreamProviderError } from 'ai';
import { describe, expect, it } from 'vitest';
import { toErrorEvent } from '../src/model/error-event.ts';
import { callProvider } from './provider-call.ts';

const json = (status: number, body: object) => () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const sse =
  (...events: object[]) =>
  () =>
    new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
      headers: { 'content-type': 'text/event-stream' },
    });

const openai = (type: string, code: string) => ({
  error: { message: 'Message.', type, param: null, code },
});

const anthropic = (type: string, details?: object) => ({
  type: 'error',
  error: { type, message: 'Message.', ...(details && { details }) },
});

const google = (code: number, status: string, reason?: string) => ({
  error: {
    code,
    message: 'Message.',
    status,
    ...(reason && { details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason }] }),
  },
});

const messageStart = {
  type: 'message_start',
  message: {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 1 },
  },
};
const textStart = {
  type: 'content_block_start',
  index: 0,
  content_block: { type: 'text', text: '' },
};
const textDelta = {
  type: 'content_block_delta',
  index: 0,
  delta: { type: 'text_delta', text: '{"points":[{"text":"Rivers' },
};

describe('the error event for a provider response', () => {
  it.each([
    [
      'an OpenAI 401 invalid_api_key',
      'unauthorized',
      'openai',
      json(401, openai('invalid_request_error', 'invalid_api_key')),
      401,
    ],
    [
      'an OpenAI 429 insufficient_quota',
      'quota_exceeded',
      'openai',
      json(429, openai('insufficient_quota', 'insufficient_quota')),
      429,
    ],
    [
      'an OpenAI 429 rate_limit_exceeded',
      'rate_limited',
      'openai',
      json(429, openai('requests', 'rate_limit_exceeded')),
      429,
    ],
    ['an OpenAI 500', 'provider', 'openai', json(500, openai('server_error', 'server_error')), 500],
    [
      'an OpenAI 502 with an HTML body',
      'provider',
      'openai',
      () => new Response('<html>Bad Gateway</html>', { status: 502 }),
      502,
    ],
    [
      'an Anthropic 401 authentication_error',
      'unauthorized',
      'anthropic',
      json(401, anthropic('authentication_error')),
      401,
    ],
    [
      'an Anthropic 403 permission_error',
      'unauthorized',
      'anthropic',
      json(403, anthropic('permission_error')),
      403,
    ],
    [
      'an Anthropic 402 billing_error',
      'quota_exceeded',
      'anthropic',
      json(402, anthropic('billing_error')),
      402,
    ],
    [
      'an Anthropic 429 rate_limit_error',
      'rate_limited',
      'anthropic',
      json(429, anthropic('rate_limit_error')),
      429,
    ],
    [
      'an Anthropic 429 at the spend limit',
      'quota_exceeded',
      'anthropic',
      json(429, anthropic('rate_limit_error', { error_code: 'enforced_spend_limit_reached' })),
      429,
    ],
    [
      'an Anthropic 529 overloaded_error',
      'provider',
      'anthropic',
      json(529, anthropic('overloaded_error')),
      529,
    ],
    [
      'an Anthropic billing_error before the message starts',
      'quota_exceeded',
      'anthropic',
      sse(anthropic('billing_error')),
      400,
    ],
    [
      'a Gemini 400 API_KEY_INVALID',
      'unauthorized',
      'google',
      json(400, google(400, 'INVALID_ARGUMENT', 'API_KEY_INVALID')),
      400,
    ],
    [
      'a Gemini 400 for another reason',
      'provider',
      'google',
      json(400, google(400, 'INVALID_ARGUMENT')),
      400,
    ],
    ['a Gemini 401', 'unauthorized', 'google', json(401, google(401, 'UNAUTHENTICATED')), 401],
    [
      'a Gemini 403 PERMISSION_DENIED',
      'unauthorized',
      'google',
      json(403, google(403, 'PERMISSION_DENIED')),
      403,
    ],
    ['a Gemini 402', 'quota_exceeded', 'google', json(402, {}), 402],
    [
      'a Gemini 429 RESOURCE_EXHAUSTED',
      'rate_limited',
      'google',
      json(429, google(429, 'RESOURCE_EXHAUSTED')),
      429,
    ],
  ] as const)('maps %s to %s', async (_, code, provider, respond, httpStatus) => {
    const { events } = await callProvider(provider, respond);
    expect(events).toEqual([{ type: 'error', code, httpStatus }]);
  });

  it.each([
    ['rate_limit_error', 'rate_limited', 429],
    ['overloaded_error', 'provider', 529],
    ['billing_error', 'quota_exceeded', 400],
  ])('maps an Anthropic %s after output has started to %s', async (type, code, httpStatus) => {
    const { events } = await callProvider(
      'anthropic',
      sse(messageStart, textStart, textDelta, anthropic(type)),
    );
    expect(events).toEqual([
      { type: 'partial', points: [{ text: 'Rivers', sentences: [] }] },
      { type: 'error', code, httpStatus },
    ]);
  });

  it('maps an OpenAI insufficient_quota after output has started to quota_exceeded', async () => {
    const { events } = await callProvider(
      'openai',
      sse(
        {
          type: 'response.created',
          response: { id: 'resp_1', created_at: 1, model: 'gpt-6-luna' },
        },
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: { type: 'message', id: 'msg_1' },
        },
        {
          type: 'response.output_text.delta',
          item_id: 'msg_1',
          output_index: 0,
          content_index: 0,
          delta: '{"points":[{"text":"Rivers',
        },
        { type: 'error', sequence_number: 3, code: 'insufficient_quota', message: 'Message.' },
      ),
    );
    expect(events).toEqual([
      { type: 'partial', points: [{ text: 'Rivers', sentences: [] }] },
      { type: 'error', code: 'quota_exceeded', httpStatus: 429 },
    ]);
  });
});

describe('toErrorEvent', () => {
  const signal = new AbortController().signal;

  it('reports network when no response came back', () => {
    const error = new APICallError({ message: 'Message.', url: '', requestBodyValues: {} });
    expect(toErrorEvent(error, signal)).toEqual({ type: 'error', code: 'network' });
  });

  it('reads the type of a stream error', () => {
    const error = new StreamProviderError({ message: 'Message.', type: 'billing_error' });
    expect(toErrorEvent(error, signal)).toMatchObject({ code: 'quota_exceeded' });
  });

  it('reports provider for a stream error with neither status nor known code', () => {
    const error = new StreamProviderError({ message: 'Message.', type: 'api_error' });
    expect(toErrorEvent(error, signal)).toEqual({ type: 'error', code: 'provider' });
  });
});
