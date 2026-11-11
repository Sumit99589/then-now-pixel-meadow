import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { config } from './config.ts';
import type { Config } from './config.ts';
import { Store, digest } from './memory/store.ts';
import type { Run } from './memory/store.ts';
import { Budget } from './agent/budget.ts';
import { runAgent } from './agent/agent.ts';
import { OpenAIModel } from './providers/openai.ts';
import { TavilySearch } from './providers/search.ts';
import { DEMO_NOW, DemoModel, DemoSearch, seedDemo } from './demo.ts';
import type { TurnResult } from './contracts.ts';
import { compactResult } from './presentation.ts';
const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
class HttpError extends Error {
    readonly status: number;
    constructor(status: number, message: string) { super(message); this.status = status; }
}
const json = (res: ServerResponse, status: number, data: unknown) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
function constantEqual(a: string, b: string): boolean { const x = Buffer.from(digest(a)), y = Buffer.from(digest(b)); return timingSafeEqual(x, y); }
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
    if (!String(req.headers['content-type']).startsWith('application/json'))
        throw new HttpError(415, 'Use application/json');
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        const b = Buffer.from(chunk);
        size += b.length;
        if (size > 20000)
            throw new HttpError(413, 'Request too large');
        chunks.push(b);
    }
    try {
        const data: unknown = JSON.parse(Buffer.concat(chunks).toString());
        if (!data || typeof data !== 'object' || Array.isArray(data))
            throw new Error();
        return data as Record<string, unknown>;
    }
    catch {
        throw new HttpError(400, 'Invalid JSON body');
    }
}
function stringField(data: Record<string, unknown>, key: string, max: number): string { const v = data[key]; if (typeof v !== 'string' || !v.trim() || v.length > max)
    throw new HttpError(400, `Invalid ${key}`); return v; }
function cookie(req: IncomingMessage): string | null {
    const match = /(?:^|;\s*)tn_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(req.headers.cookie ?? '');
    return match?.[1] ?? null;
}
export function createApp(cfg: Config, store = new Store(cfg.databasePath)): {
    server: ReturnType<typeof createServer>;
    store: Store;
} {
    const rate = new Map<string, {
        start: number;
        count: number;
    }>();
    const active = new Set<string>();
    let cleanupCounter = 0;
    const server = createServer(async (req, res) => {
        let running: Run | null = null;
        let budget: Budget | null = null;
        const disconnected = new AbortController();
        res.on('close', () => { if (!res.writableEnded)
            disconnected.abort(new Error('Client disconnected')); });
        res.setHeader('x-content-type-options', 'nosniff');
        res.setHeader('referrer-policy', 'no-referrer');
        res.setHeader('cache-control', 'no-store');
        res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        try {
            if (cfg.appPassword) {
                const raw = req.headers.authorization ?? '';
                let credential = '';
                try {
                    credential = Buffer.from(raw.replace(/^Basic /i, ''), 'base64').toString().split(':').slice(1).join(':');
                }
                catch { /* unauthorized */ }
                if (!/^Basic /i.test(raw) || !constantEqual(credential, cfg.appPassword)) {
                    res.setHeader('www-authenticate', 'Basic realm="Tracy", charset="UTF-8"');
                    throw new HttpError(401, 'Authentication required');
                }
            }
            const host = req.headers.host ?? '';
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : cfg.port;
            const localOrigins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`, `http://[::1]:${port}`]);
            const expected = cfg.publicOrigin ? new Set([cfg.publicOrigin]) : localOrigins;
            const requestOrigin = cfg.publicOrigin || `http://${host}`;
            // DNS-rebinding protection for the default localhost app. Remote deployments use PUBLIC_ORIGIN.
            if (!cfg.publicOrigin && !expected.has(requestOrigin))
                throw new HttpError(403, 'Unexpected Host header');
            if (req.headers.origin && !expected.has(req.headers.origin))
                throw new HttpError(403, 'Cross-origin request rejected');
            const url = new URL(req.url ?? '/', `http://${host || 'localhost'}`);
            if (url.pathname === '/api/health') {
                json(res, 200, { ok: true, mode: cfg.demo ? 'offline-fixture' : 'live', configured: cfg.demo || !!(cfg.openaiKey && cfg.tavilyKey) });
                return;
            }
            let userId: string | null = null;
            if (url.pathname.startsWith('/api/')) {
                const token = cookie(req);
                userId = token ? store.userFromToken(token) : null;
                if (!userId) {
                    const session = store.createUser();
                    userId = session.userId;
                    res.setHeader('set-cookie', `tn_session=${session.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${cfg.publicOrigin.startsWith('https://') ? '; Secure' : ''}`);
                    if (cfg.demo)
                        seedDemo(store, userId);
                }
            }
            if (req.method === 'GET' && url.pathname === '/api/session') {
                json(res, 200, { mode: cfg.demo ? 'offline-fixture' : 'live', configured: cfg.demo || !!(cfg.openaiKey && cfg.tavilyKey), timezone: cfg.timezone, now: cfg.demo ? DEMO_NOW.toISOString() : new Date().toISOString(), threads: store.listThreads(userId!) });
                return;
            }
            if (req.method === 'POST' && url.pathname === '/api/threads') {
                const threadId = store.createThread(userId!);
                json(res, 201, { id: threadId });
                return;
            }
            if (req.method === 'GET' && url.pathname === '/api/messages') {
                const thread = url.searchParams.get('thread_id') ?? '';
                if (!store.hasThread(userId!, thread))
                    throw new HttpError(404, 'Conversation not found');
                const messages = store.listMessages(userId!, thread).map(m => ({ ...m, result: m.role === 'assistant' ? store.resultForMessage(userId!, m.id) : null }));
                json(res, 200, { messages });
                return;
            }
            if (req.method === 'GET' && url.pathname.startsWith('/api/sources/')) {
                const source = store.getSource(userId!, url.pathname.slice('/api/sources/'.length));
                if (!source)
                    throw new HttpError(404, 'Source not found');
                json(res, 200, source);
                return;
            }
            if (req.method === 'DELETE' && url.pathname === '/api/memory') {
                if ([...active].some(key => key.startsWith(`${userId}:`)))
                    throw new HttpError(409, 'Stop active turns before deleting memory');
                store.deleteAll(userId!);
                json(res, 200, { ok: true });
                return;
            }
            if (req.method === 'POST' && url.pathname === '/api/chat') {
                const data = await body(req);
                const text = stringField(data, 'text', 12000), threadId = stringField(data, 'thread_id', 80), key = stringField(data, 'request_id', 80);
                if (!/^[A-Za-z0-9_-]{8,80}$/.test(key))
                    throw new HttpError(400, 'Invalid request_id');
                const timezone = typeof data.timezone === 'string' ? data.timezone : cfg.timezone;
                try {
                    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
                }
                catch {
                    throw new HttpError(400, 'Invalid IANA timezone');
                }
                if (!store.hasThread(userId!, threadId))
                    throw new HttpError(404, 'Conversation not found');
                const old = store.runByKey(userId!, key);
                if (old && old.request_hash !== digest(JSON.stringify({ threadId, text, timezone })))
                    throw new HttpError(409, 'This request_id was already used for different input');
                const emit = (event: string, payload: unknown) => { if (!res.destroyed)
                    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); };
                const openStream = () => { res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' }); res.flushHeaders(); };
                if (old?.status === 'complete') {
                    openStream();
                    emit('answer', JSON.parse(old.result_json!) as TurnResult);
                    emit('done', { run_id: old.id, replayed: true });
                    res.end();
                    return;
                }
                if (old)
                    throw new HttpError(409, old.status === 'running' ? 'That turn is already running.' : old.error ?? 'That turn failed; send a new request to retry.');
                if (!cfg.demo && (!cfg.openaiKey || !cfg.tavilyKey))
                    throw new HttpError(503, 'Set OPENAI_API_KEY and TAVILY_API_KEY in .env, or run npm run demo for clearly labelled synthetic fixtures.');
                const nowMs = Date.now(), rateKey = userId!;
                const bucket = rate.get(rateKey);
                if (bucket && nowMs - bucket.start < 60000) {
                    if (bucket.count >= 12)
                        throw new HttpError(429, 'Too many turns. Try again in a minute.');
                    bucket.count++;
                }
                else
                    rate.set(rateKey, { start: nowMs, count: 1 });
                if (++cleanupCounter % 100 === 0)
                    for (const [k, v] of rate)
                        if (nowMs - v.start > 120000)
                            rate.delete(k);
                const activeKey = `${userId}:${threadId}`;
                if (active.has(activeKey))
                    throw new HttpError(409, 'A turn is already running in this conversation');
                if (active.size >= 8)
                    throw new HttpError(503, 'The server is handling its current turn limit');
                active.add(activeKey);
                try {
                    const now = cfg.demo ? new Date(DEMO_NOW) : new Date();
                    const begun = store.beginRun(userId!, threadId, key, text, now.toISOString(), timezone);
                    running = begun.run;
                    openStream();
                    emit('started', { run_id: running.id, user_message_id: begun.userMessage.id });
                    budget = new Budget(disconnected.signal, cfg.turnTimeoutMs);
                    const model = cfg.demo ? new DemoModel(budget) : new OpenAIModel(cfg, budget);
                    const web = cfg.demo ? new DemoSearch(budget) : new TavilySearch(cfg.tavilyKey, budget);
                    const heartbeat = setInterval(() => { if (!res.destroyed)
                        res.write(': heartbeat\n\n'); }, 10000);
                    heartbeat.unref();
                    try {
                        const result = await runAgent({ userId: userId!, threadId, messageId: begun.userMessage.id, text, timezone, now }, { store, budget, model, web, emit, saveSources: s => store.saveSources(userId!, running!.id, s) });
                        budget.signal.throwIfAborted();
                        const msg = store.completeRun(running, result, cfg.demo ? DEMO_NOW.toISOString() : new Date().toISOString());
                        emit('answer', compactResult(result));
                        emit('done', { run_id: running.id, assistant_message_id: msg.id });
                        res.end();
                    }
                    finally {
                        clearInterval(heartbeat);
                    }
                }
                finally {
                    active.delete(activeKey);
                }
                return;
            }
            const staticFiles: Record<string, {
                name: string;
                type: string;
            }> = { '/': { name: 'index.html', type: 'text/html; charset=utf-8' }, '/app.js': { name: 'app.js', type: 'text/javascript; charset=utf-8' }, '/pixel-art.js': { name: 'pixel-art.js', type: 'text/javascript; charset=utf-8' }, '/meadow.js': { name: 'meadow.js', type: 'text/javascript; charset=utf-8' }, '/favicon.svg': { name: 'favicon.svg', type: 'image/svg+xml' }, '/style.css': { name: 'style.css', type: 'text/css; charset=utf-8' } };
            const file = staticFiles[url.pathname];
            if (req.method === 'GET' && file) {
                const bytes = await readFile(publicDirectory + file.name);
                res.writeHead(200, { 'content-type': file.type });
                res.end(bytes);
                return;
            }
            throw new HttpError(404, 'Not found');
        }
        catch (error) {
            const safe = error instanceof HttpError ? error.message : disconnected.signal.aborted ? 'Turn cancelled.' : budget?.signal.aborted ? 'This turn reached its time limit. No unfinished answer was saved.' : 'The turn could not complete. Check API configuration and provider availability, then retry.';
            if (running)
                store.failRun(running, safe);
            if (!res.destroyed) {
                if (res.headersSent) {
                    res.write(`event: error\ndata: ${JSON.stringify({ error: safe })}\n\n`);
                    res.end();
                }
                else
                    json(res, error instanceof HttpError ? error.status : 500, { error: safe });
            }
            if (!(error instanceof HttpError) && !disconnected.signal.aborted)
                console.error(JSON.stringify({ event: 'request_failed', run_id: running?.id, kind: error instanceof Error ? error.name : 'unknown' }));
        }
        finally {
            budget?.close();
        }
    });
    server.requestTimeout = 120000;
    server.headersTimeout = 15000;
    return { server, store };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.umask(0o077);
    const cfg = config();
    const { server, store } = createApp(cfg);
    store.recover();
    server.listen(cfg.port, cfg.host, () => console.log(`Tracy · http://${cfg.host}:${cfg.port} · ${cfg.demo ? 'OFFLINE SYNTHETIC FIXTURE' : cfg.openaiKey && cfg.tavilyKey ? 'live' : 'add API keys in .env'}`));
    const close = () => { server.close(() => { store.close(); process.exit(0); }); setTimeout(() => process.exit(1), 5000).unref(); };
    process.on('SIGINT', close);
    process.on('SIGTERM', close);
}
