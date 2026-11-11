import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { get } from 'node:http';
import { createApp } from '../src/server.ts';
import { config } from '../src/config.ts';
import { Store } from '../src/memory/store.ts';
async function server(t: TestContext, demo = true) { const store = new Store(':memory:'); const cfg = config({ DEMO_MODE: String(demo), PORT: '0' }); const app = createApp(cfg, store); app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening'); t.after(async () => { await new Promise<void>((resolve, reject) => app.server.close(e => e ? reject(e) : resolve())); store.close(); }); const address = app.server.address() as {
    port: number;
}; const base = `http://127.0.0.1:${address.port}`; const session = await fetch(base + '/api/session'); const cookie = session.headers.get('set-cookie')!.split(';')[0]!; const sessionData = await session.json() as {
    threads: Array<{
        id: string;
    }>;
}; return { ...app, base, cookie, session: sessionData }; }
async function newThread(base: string, cookie: string) { const r = await fetch(base + '/api/threads', { method: 'POST', headers: { cookie } }); return (await r.json() as {
    id: string;
}).id; }
const chat = (base: string, cookie: string, thread: string, key = 'request-123', extra = {}) => fetch(base + '/api/chat', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ thread_id: thread, request_id: key, text: 'On Monday we shortlisted 5 CRM tools. Has any pricing changed since?', timezone: 'Asia/Kolkata', ...extra }) });
test('HTTP session uses HttpOnly SameSite cookies and a restrictive CSP', async (t) => { const s = await server(t); const r = await fetch(s.base + '/api/session'); assert.match(r.headers.get('set-cookie')!, /HttpOnly; SameSite=Strict/); assert.match(r.headers.get('content-security-policy')!, /script-src 'self'/); assert.match(s.cookie.split('=')[1]!, /^[A-Za-z0-9_-]{43}$/); assert.notEqual(s.cookie.split('=')[1], s.store.userFromToken(s.cookie.split('=')[1]!)); });
test('web UI and health endpoint boot without API credentials; live chat fails explicitly', async (t) => { const s = await server(t, false); const ui = await fetch(s.base + '/'); assert.equal(ui.status, 200); assert((await ui.text()).includes('tracy')); const thread = await newThread(s.base, s.cookie); const r = await chat(s.base, s.cookie, thread); assert.equal(r.status, 503); assert((await r.text()).includes('OPENAI_API_KEY')); assert.equal(s.store.listMessages(s.store.userFromToken(s.cookie.split('=')[1]!)!, thread).length, 0); });
test('SSE returns progress, a checked answer, then done', async (t) => { const s = await server(t); const thread = await newThread(s.base, s.cookie); const r = await chat(s.base, s.cookie, thread); assert.equal(r.status, 200); assert.match(r.headers.get('content-type')!, /event-stream/); const text = await r.text(); assert(text.includes('event: status')); assert(text.includes('event: answer')); assert(text.includes('event: done')); assert(text.indexOf('event: answer') < text.indexOf('event: done')); const line = text.split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)) as {
    answer?: {
        comparisons: unknown[];
    };
}).find(v => v.answer); assert.equal(line?.answer?.comparisons.length, 5); });
test('completed idempotent replay does not append duplicate messages', async (t) => { const s = await server(t); const thread = await newThread(s.base, s.cookie); await (await chat(s.base, s.cookie, thread)).text(); const replay = await (await chat(s.base, s.cookie, thread)).text(); assert(replay.includes('"replayed":true')); const user = s.store.userFromToken(s.cookie.split('=')[1]!)!; assert.equal(s.store.listMessages(user, thread).length, 2); });
test('idempotency key cannot be reused with different text or timezone', async (t) => { const s = await server(t); const thread = await newThread(s.base, s.cookie); await (await chat(s.base, s.cookie, thread)).text(); assert.equal((await chat(s.base, s.cookie, thread, 'request-123', { text: 'different' })).status, 409); assert.equal((await chat(s.base, s.cookie, thread, 'request-123', { timezone: 'UTC' })).status, 409); });
test('another browser cannot fetch or write a conversation even if it knows the ID', async (t) => { const s = await server(t); const thread = await newThread(s.base, s.cookie); const outsider = await fetch(s.base + '/api/session'); const cookie = outsider.headers.get('set-cookie')!.split(';')[0]!; assert.equal((await fetch(`${s.base}/api/messages?thread_id=${thread}`, { headers: { cookie } })).status, 404); assert.equal((await chat(s.base, cookie, thread)).status, 404); });
test('client-provided user IDs cannot change server-derived identity', async (t) => { const s = await server(t); const thread = await newThread(s.base, s.cookie); const response = await chat(s.base, s.cookie, thread, 'request-identity', { user_id: 'u_victim' }); assert.equal(response.status, 200); await response.text(); const user = s.store.userFromToken(s.cookie.split('=')[1]!)!; assert(s.store.listMessages(user, thread).every(m => m.user_id === user)); });
test('cross-origin writes and DNS-rebinding Host headers are rejected', async (t) => { const s = await server(t); assert.equal((await fetch(s.base + '/api/threads', { method: 'POST', headers: { origin: 'https://attacker.example', cookie: s.cookie } })).status, 403); const hostileStatus = await new Promise<number>(resolve => { get(s.base + '/api/session', { headers: { host: 'attacker.example' } }, res => { res.resume(); resolve(res.statusCode!); }); }); assert.equal(hostileStatus, 403); });
test('invalid timezone and oversized request bodies are rejected before starting a run', async (t) => { const s = await server(t); const thread = await newThread(s.base, s.cookie); assert.equal((await chat(s.base, s.cookie, thread, 'request-time', { timezone: 'Not/AZone' })).status, 400); assert.equal((await chat(s.base, s.cookie, thread, 'request-huge', { text: 'x'.repeat(22000) })).status, 413); });
test('deleting history removes only the authenticated browser data', async (t) => { const s = await server(t); const outsider = await fetch(s.base + '/api/session'); const otherCookie = outsider.headers.get('set-cookie')!.split(';')[0]!; assert.equal((await fetch(s.base + '/api/memory', { method: 'DELETE', headers: { cookie: s.cookie } })).status, 200); const own = await (await fetch(s.base + '/api/session', { headers: { cookie: s.cookie } })).json() as {
    threads: unknown[];
}; const other = await (await fetch(s.base + '/api/session', { headers: { cookie: otherCookie } })).json() as {
    threads: unknown[];
}; assert.equal(own.threads.length, 0); assert.equal(other.threads.length, 2); });
test('binding a public interface requires an explicit access password', () => assert.throws(() => config({ HOST: '0.0.0.0' }), /APP_PASSWORD/));
test('full archived source lookup is ownership-scoped', async (t) => { const s = await server(t); const owner = s.store.userFromToken(s.cookie.split('=')[1]!)!; const row = s.store.db.prepare('SELECT id FROM sources WHERE user_id=? LIMIT 1').get(owner)!; const own = await fetch(`${s.base}/api/sources/${row.id}`, { headers: { cookie: s.cookie } }); assert.equal(own.status, 200); const outsider = await fetch(s.base + '/api/session'); const other = outsider.headers.get('set-cookie')!.split(';')[0]!; assert.equal((await fetch(`${s.base}/api/sources/${row.id}`, { headers: { cookie: other } })).status, 404); });

test('pixel presentation modules are explicitly served under the unchanged restrictive CSP', async (t) => {
    const s = await server(t);
    for (const path of ['/app.js', '/pixel-art.js', '/meadow.js', '/style.css', '/favicon.svg']) {
        const response = await fetch(s.base + path);
        assert.equal(response.status, 200, path);
        assert.match(response.headers.get('content-security-policy')!, /script-src 'self'/);
        assert(!response.headers.get('content-security-policy')!.includes('unsafe-inline'));
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        assert((await response.text()).length > 100);
    }
    const svg = await fetch(s.base + '/favicon.svg');
    assert.equal(svg.headers.get('content-type'), 'image/svg+xml');
    const module = await fetch(s.base + '/pixel-art.js');
    assert.match(module.headers.get('content-type')!, /text\/javascript/);
});
test('new presentation assets do not introduce a wildcard filesystem route', async (t) => {
    const s = await server(t);
    for (const path of ['/.env', '/public/pixel-art.js', '/README.md', '/pixel-art.d.ts', '/src/config.ts']) {
        assert.equal((await fetch(s.base + path)).status, 404, path);
    }
});
