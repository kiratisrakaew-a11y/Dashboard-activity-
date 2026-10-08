const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./load')();
// ค่าที่มาจาก vm context มี prototype คนละ realm → แปลงเป็น plain ก่อนเทียบ
const plain = (x) => JSON.parse(JSON.stringify(x));

const REQ = { system: 'SYS', user: 'USER', schema: G.REVIEW_SCHEMA, schemaName: 'activity_review' };
const GOOD = { criteria: [{ name: 'a', result: 'yes', comment: '' }] };

test('OpenAI: request ใช้ json_schema strict และ parse ได้', () => {
  const r = G.aiBuildRequest_('openai', 'm1', 'KEY', REQ, {});
  const body = JSON.parse(r.options.payload);
  assert.equal(r.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(r.options.headers.Authorization, 'Bearer KEY');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.messages[0].role, 'system');
  const p = G.aiParseResponse_('openai', { choices: [{ message: { content: JSON.stringify(GOOD) }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 7 } });
  assert.deepEqual(plain(p.usage), { input: 5, output: 7 });
  assert.equal(p.data.criteria[0].result, 'yes');
  assert.throws(() => G.aiParseResponse_('openai', { choices: [{ message: { refusal: 'no' } }] }), /ปฏิเสธ/);
});

test('Gemini: แปลง schema และ parse ได้', () => {
  const r = G.aiBuildRequest_('gemini', 'gm', 'KEY', REQ, {});
  const body = JSON.parse(r.options.payload);
  assert.match(r.url, /models\/gm:generateContent$/);
  assert.equal(r.options.headers['x-goog-api-key'], 'KEY');
  const s = body.generationConfig.responseSchema;
  assert.equal(s.type, 'OBJECT');
  assert.equal(s.additionalProperties, undefined);
  const ip = s.properties.extracted.properties.initial_price;
  assert.equal(ip.type, 'NUMBER');
  assert.equal(ip.nullable, true);
  assert.deepEqual(plain(s.properties.suggested_type.enum), plain(G.ACTIVITY_TYPES));
  const p = G.aiParseResponse_('gemini', { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(GOOD) }] } }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4 } });
  assert.deepEqual(plain(p.usage), { input: 3, output: 4 });
  assert.throws(() => G.aiParseResponse_('gemini', { candidates: [{ finishReason: 'SAFETY' }] }), /SAFETY/);
});

test('Claude: ใช้ output_config.format + fallbacks และข้าม thinking block', () => {
  const r = G.aiBuildRequest_('claude', 'claude-opus-5-5', 'KEY', REQ, { AI_EFFORT: 'low' });
  const body = JSON.parse(r.options.payload);
  assert.equal(r.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(r.options.headers['x-api-key'], 'KEY');
  assert.equal(r.options.headers['anthropic-version'], '2023-06-01');
  assert.equal(r.options.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  assert.equal(body.fallbacks, 'default');
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.equal(body.output_config.effort, 'low');
  assert.equal(body.tool_choice, undefined);
  const h = G.aiBuildRequest_('claude', 'claude-haiku-5-5', 'KEY', REQ, {});
  assert.equal(JSON.parse(h.options.payload).fallbacks, undefined);

  const p = G.aiParseResponse_('claude', { stop_reason: 'end_turn',
    content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(GOOD) }],
    usage: { input_tokens: 10, output_tokens: 20 } });
  assert.deepEqual(plain(p.usage), { input: 10, output: 20 });
  assert.throws(() => G.aiParseResponse_('claude', { stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [] }), /cyber/);
  assert.throws(() => G.aiParseResponse_('claude', { stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }), /ไม่ใช่ JSON/);
});

test('provider ไม่รู้จัก → error', () => {
  assert.throws(() => G.aiBuildRequest_('foo', 'x', 'k', REQ, {}), /ไม่รู้จัก/);
});
