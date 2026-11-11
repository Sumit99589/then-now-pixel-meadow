import test from 'node:test';
import assert from 'node:assert/strict';
import { Budget, parallelMap } from '../src/agent/budget.ts';
import { TavilySearch, safeUrl, queryKey } from '../src/providers/search.ts';
import { OpenAIModel } from '../src/providers/openai.ts';
import { ProviderError, postJson } from '../src/providers/http.ts';
import type { Fetch } from '../src/providers/http.ts';
import type { SearchQuery } from '../src/contracts.ts';
import { planSchema } from '../src/contracts.ts';
import { config } from '../src/config.ts';
import { memoryFixture, now } from './helpers.ts';
const q: SearchQuery = { query: 'Aster CRM official pricing', subject: 'Aster CRM', purpose: 'current', domains: [], since: '2026-11-09' };
const budget = () => new Budget(new AbortController().signal, 10000);
test('current pricing queries are not filtered by publication date', async () => { const b = budget(); try {
    let data: Record<string, unknown> = {};
    const f: Fetch = async (_u, o) => { data = JSON.parse(String(o?.body)); return Response.json({ results: [] }); };
    await new TavilySearch('test', b, () => new Date(now), f).search(q, b.signal);
    assert(!('start_date' in data));
    assert.equal(data.include_raw_content, 'markdown');
    assert.equal(data.include_answer, false);
    assert.equal(data.max_age_hours, 1);
}
finally {
    b.close();
} });
test('change searches use an explicit baseline date', async () => { const b = budget(); try {
    let data: Record<string, unknown> = {};
    const f: Fetch = async (_u, o) => { data = JSON.parse(String(o?.body)); return Response.json({ results: [] }); };
    await new TavilySearch('test', b, () => new Date(now), f).search({ ...q, purpose: 'changes' }, b.signal);
    assert.equal(data.start_date, '2026-11-09');
}
finally {
    b.close();
} });
test('search snapshots distinguish observed time from publication time and retain content hashes', async () => { const b = budget(); try {
    const f: Fetch = async () => Response.json({ results: [{ url: 'https://example.com/pricing?utm_source=ad', title: 'Pricing', content: 'short snippet', raw_content: 'Original full page text.', published_date: '2025-01-01' }] });
    const sources = await new TavilySearch('test', b, () => new Date(now), f).search(q, b.signal);
    assert.equal(sources[0]?.content, 'Original full page text.');
    assert.equal(sources[0]?.observed_at, now);
    assert.equal(sources[0]?.published_at, '2025-01-01');
    assert.equal(sources[0]?.url, 'https://example.com/pricing');
    assert.equal(sources[0]?.content_hash.length, 64);
}
finally {
    b.close();
} });
test('non-http, credential-bearing and local source URLs are rejected', () => { for (const u of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user:pass@example.com/', 'http://127.0.0.1/a', 'http://2130706433/a', 'http://10.0.0.1/a', 'http://172.16.1.1/a', 'http://192.168.1.1/a', 'http://[::1]/', 'http://local.internal/'])
    assert.equal(safeUrl(u), null, u); assert.equal(safeUrl('https://example.com/pricing?plan=pro&utm_source=ad#top'), 'https://example.com/pricing?plan=pro'); });
test('query dedup preserves substantive date/domain differences', () => { assert.equal(queryKey(q), queryKey({ ...q, query: '  ASTER   CRM official pricing ' })); assert.notEqual(queryKey(q), queryKey({ ...q, since: '2026-01-01' })); });
test('a transient 503 retries once, charging both physical requests to the budget', async () => { const b = budget(); try {
    let calls = 0;
    const f: Fetch = async () => ++calls === 1 ? new Response('', { status: 503 }) : Response.json({ ok: true });
    assert.deepEqual(await postJson('https://example.com', {}, 'key', 'Test', b.signal, b, 'search', f), { ok: true });
    assert.equal(calls, 2);
    assert.equal(b.counts.search, 2);
}
finally {
    b.close();
} });
test('authentication failures are not retried and do not expose provider response text', async () => { const b = budget(); try {
    let calls = 0;
    const f: Fetch = async () => { calls++; return new Response('secret credential', { status: 401 }); };
    await assert.rejects(postJson('https://example.com', {}, 'secret', 'Test', b.signal, b, 'search', f), e => e instanceof ProviderError && !e.message.includes('secret'));
    assert.equal(calls, 1);
}
finally {
    b.close();
} });
test('Responses API receives a strict contract and store=false', async () => { const b = budget(); try {
    let data: Record<string, unknown> = {};
    const f: Fetch = async (_u, o) => { data = JSON.parse(String(o?.body)); return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(memoryFixture().plan) }] }], usage: { input_tokens: 100, output_tokens: 20 } }); };
    const m = new OpenAIModel(config({}), b, f);
    const result = await m.complete({ stage: 'plan', instructions: 'test', data: {}, schema: planSchema, signal: b.signal });
    assert.equal(data.store, false);
    assert.equal((data.text as {
        format: {
            strict: boolean;
        };
    }).format.strict, true);
    assert.equal(result.usage.input_tokens, 100);
    assert.equal(b.counts.model, 1);
}
finally {
    b.close();
} });
test('incomplete model output and refusals do not become successful answers', async () => { for (const response of [{ status: 'incomplete', output: [] }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }]) {
    const b = budget();
    try {
        const f: Fetch = async () => Response.json(response);
        await assert.rejects(new OpenAIModel(config({}), b, f).complete({ stage: 'plan', instructions: 'test', data: {}, schema: planSchema, signal: b.signal }));
    }
    finally {
        b.close();
    }
} });
test('hard budgets prevent calls beyond the configured count', () => { const b = new Budget(new AbortController().signal, 1000, { model: 1, search: 1 }); try {
    b.take('search');
    assert.throws(() => b.take('search'), /limit/);
    assert.equal(b.counts.search, 1);
}
finally {
    b.close();
} });
test('parallel map preserves input order and never exceeds its concurrency limit', async () => { let active = 0, max = 0; const values = await parallelMap([1, 2, 3, 4, 5, 6], 2, async (n) => { active++; max = Math.max(max, active); await new Promise(r => setTimeout(r, 5)); active--; return n * 2; }); assert.equal(max, 2); assert.deepEqual(values, [2, 4, 6, 8, 10, 12]); });
test('parent cancellation immediately prevents further provider work', () => { const parent = new AbortController(); const b = new Budget(parent.signal, 1000); try {
    parent.abort(new Error('cancelled'));
    assert.throws(() => b.take('model'), /cancelled/);
}
finally {
    b.close();
} });
test('privacy guard applies at the provider boundary, including follow-up searches', async () => { const b = budget(); try {
    let sent = false;
    const f: Fetch = async () => { sent = true; return Response.json({ results: [] }); };
    await assert.rejects(new TavilySearch('test', b, () => new Date(now), f).search({ ...q, query: 'Find account data for private@company.example' }, b.signal), /private identifier/);
    assert.equal(sent, false);
    assert.equal(b.counts.search, 0);
}
finally {
    b.close();
} });
test('in-flight provider work observes abort without retrying a cancelled turn', async () => { const parent = new AbortController(); const b = new Budget(parent.signal, 1000); try {
    const f: Fetch = async (_url, options) => new Promise<Response>((_resolve, reject) => { options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), { once: true }); queueMicrotask(() => parent.abort(new Error('user stopped'))); });
    await assert.rejects(postJson('https://example.com', {}, 'key', 'Test', b.signal, b, 'search', f), /user stopped/);
    assert.equal(b.counts.search, 1);
}
finally {
    b.close();
} });
