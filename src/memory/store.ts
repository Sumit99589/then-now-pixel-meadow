import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { compactResult } from '../presentation.ts';
import type { Answer, DateWindow, MemoryBundle, Message, Source, TurnResult } from '../contracts.ts';
type Row = Record<string, unknown>;
export const id = (prefix: string) => `${prefix}_${randomUUID()}`;
export const digest = (text: string) => createHash('sha256').update(text).digest('hex');
function message(row: Row): Message {
    return { id: String(row.id), user_id: String(row.user_id), thread_id: String(row.thread_id), seq: Number(row.seq), role: row.role as Message['role'], content: String(row.content), created_at: String(row.created_at), answer: row.answer_json ? JSON.parse(String(row.answer_json)) as Answer : null };
}
function source(row: Row): Source { const { user_id: _, run_id: __, ...rest } = row; return rest as unknown as Source; }
export interface Run {
    id: string;
    user_id: string;
    thread_id: string;
    request_key: string;
    request_hash: string;
    status: 'running' | 'complete' | 'failed';
    result_json: string | null;
    error: string | null;
}
export function answerText(answer: Answer): string {
    return [
        ...answer.paragraphs.map(p => p.text),
        ...answer.comparisons.map(c => `${c.subject}: ${c.verdict.replaceAll('_', ' ')}\nPreviously: ${c.before}\nNow: ${c.now}\n${c.note}`),
        answer.question
    ].filter(Boolean).join('\n\n');
}
export class Store {
    readonly db: DatabaseSync;
    constructor(path: string) {
        if (path !== ':memory:')
            mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        this.db = new DatabaseSync(path);
        this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;');
        if (path !== ':memory:')
            chmodSync(path, 0o600);
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, session_hash TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS threads (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), thread_id TEXT NOT NULL REFERENCES threads(id), request_key TEXT NOT NULL, request_hash TEXT NOT NULL, status TEXT NOT NULL, result_json TEXT, error TEXT, created_at TEXT NOT NULL, completed_at TEXT, UNIQUE(user_id,request_key));
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_turn ON runs(user_id,thread_id) WHERE status='running';
      CREATE TABLE IF NOT EXISTS messages (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), thread_id TEXT NOT NULL REFERENCES threads(id), role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL, created_at TEXT NOT NULL, answer_json TEXT, run_id TEXT REFERENCES runs(id));
      CREATE INDEX IF NOT EXISTS messages_owner_time ON messages(user_id,created_at,seq);
      CREATE INDEX IF NOT EXISTS messages_thread ON messages(user_id,thread_id,seq);
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content,content='messages',content_rowid='seq',tokenize='porter unicode61');
      CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN INSERT INTO messages_fts(rowid,content) VALUES (new.seq,new.content); END;
      CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN INSERT INTO messages_fts(messages_fts,rowid,content) VALUES ('delete',old.seq,old.content); END;
      CREATE TABLE IF NOT EXISTS sources (user_id TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL, run_id TEXT REFERENCES runs(id), url TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, content_hash TEXT NOT NULL, observed_at TEXT NOT NULL, published_at TEXT, query TEXT NOT NULL, PRIMARY KEY(user_id,id));
      CREATE TABLE IF NOT EXISTS message_sources (user_id TEXT NOT NULL, message_id TEXT NOT NULL REFERENCES messages(id), source_id TEXT NOT NULL, PRIMARY KEY(user_id,message_id,source_id), FOREIGN KEY(user_id,source_id) REFERENCES sources(user_id,id));
      PRAGMA user_version=1;
    `);
    }
    close(): void { this.db.close(); }
    recover(): void { this.db.prepare("UPDATE runs SET status='failed', error='The server restarted before this turn completed.' WHERE status='running'").run(); }
    createUser(now = new Date().toISOString()): {
        userId: string;
        token: string;
    } {
        const userId = id('u'), token = randomBytes(32).toString('base64url');
        this.db.prepare('INSERT INTO users VALUES (?,?,?)').run(userId, digest(token), now);
        return { userId, token };
    }
    userFromToken(token: string): string | null { const row = this.db.prepare('SELECT id FROM users WHERE session_hash=?').get(digest(token)); return row ? String(row.id) : null; }
    createThread(userId: string, title = 'New conversation', now = new Date().toISOString()): string { const threadId = id('t'); this.db.prepare('INSERT INTO threads VALUES (?,?,?,?)').run(threadId, userId, title.slice(0, 80), now); return threadId; }
    hasThread(userId: string, threadId: string): boolean { return !!this.db.prepare('SELECT 1 FROM threads WHERE user_id=? AND id=?').get(userId, threadId); }
    listThreads(userId: string): Row[] { return this.db.prepare(`SELECT t.id,t.title,t.created_at,COALESCE(MAX(m.created_at),t.created_at) updated_at FROM threads t LEFT JOIN messages m ON m.thread_id=t.id AND m.user_id=t.user_id WHERE t.user_id=? GROUP BY t.id ORDER BY updated_at DESC LIMIT 100`).all(userId) as Row[]; }
    listMessages(userId: string, threadId: string): Message[] { return (this.db.prepare('SELECT * FROM (SELECT * FROM messages WHERE user_id=? AND thread_id=? ORDER BY seq DESC LIMIT 100) ORDER BY seq').all(userId, threadId) as Row[]).map(message); }
    appendMessage(userId: string, threadId: string, role: Message['role'], content: string, createdAt: string, answer: Answer | null = null, runId: string | null = null): Message {
        if (!this.hasThread(userId, threadId))
            throw new Error('Conversation not found');
        const mid = id('m');
        this.db.prepare('INSERT INTO messages (id,user_id,thread_id,role,content,created_at,answer_json,run_id) VALUES (?,?,?,?,?,?,?,?)').run(mid, userId, threadId, role, content, createdAt, answer ? JSON.stringify(answer) : null, runId);
        return message(this.db.prepare('SELECT * FROM messages WHERE id=? AND user_id=?').get(mid, userId) as Row);
    }
    runByKey(userId: string, key: string): Run | null { return (this.db.prepare('SELECT * FROM runs WHERE user_id=? AND request_key=?').get(userId, key) as unknown as Run) ?? null; }
    beginRun(userId: string, threadId: string, key: string, text: string, now: string, timezone = 'UTC'): {
        run: Run;
        userMessage: Message;
    } {
        if (!this.hasThread(userId, threadId))
            throw new Error('Conversation not found');
        const runId = id('r');
        this.db.exec('BEGIN IMMEDIATE');
        try {
            this.db.prepare("INSERT INTO runs (id,user_id,thread_id,request_key,request_hash,status,created_at) VALUES (?,?,?,?,?,'running',?)").run(runId, userId, threadId, key, digest(JSON.stringify({ threadId, text, timezone })), now);
            const userMessage = this.appendMessage(userId, threadId, 'user', text, now, null, runId);
            this.db.prepare("UPDATE threads SET title=? WHERE id=? AND user_id=? AND title='New conversation'").run(text.slice(0, 65), threadId, userId);
            this.db.exec('COMMIT');
            return { run: this.runByKey(userId, key)!, userMessage };
        }
        catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }
    saveSources(userId: string, runId: string | null, sources: Source[]): void {
        const stmt = this.db.prepare('INSERT OR IGNORE INTO sources (user_id,id,run_id,url,title,content,content_hash,observed_at,published_at,query) VALUES (?,?,?,?,?,?,?,?,?,?)');
        for (const s of sources)
            stmt.run(userId, s.id, runId, s.url, s.title, s.content, s.content_hash, s.observed_at, s.published_at, s.query);
    }
    completeRun(run: Run, result: TurnResult, now: string): Message {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            this.saveSources(run.user_id, run.id, result.sources);
            const msg = this.appendMessage(run.user_id, run.thread_id, 'assistant', answerText(result.answer), now, result.answer, run.id);
            const used = new Set([
                ...result.answer.paragraphs.flatMap(p => p.evidence.map(e => e.source_id)),
                ...result.answer.comparisons.flatMap(c => [...c.evidence, ...c.baseline_evidence].map(e => e.source_id))
            ]);
            for (const sid of used)
                if (this.db.prepare('SELECT 1 FROM sources WHERE user_id=? AND id=?').get(run.user_id, sid))
                    this.db.prepare('INSERT OR IGNORE INTO message_sources VALUES (?,?,?)').run(run.user_id, msg.id, sid);
            this.db.prepare("UPDATE runs SET status='complete',result_json=?,completed_at=? WHERE id=? AND user_id=? AND status='running'").run(JSON.stringify(compactResult(result)), now, run.id, run.user_id);
            this.db.exec('COMMIT');
            return msg;
        }
        catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }
    failRun(run: Run, error: string): void { this.db.prepare("UPDATE runs SET status='failed',error=?,completed_at=? WHERE id=? AND user_id=? AND status='running'").run(error, new Date().toISOString(), run.id, run.user_id); }
    resultForMessage(userId: string, messageId: string): TurnResult | null {
        const row = this.db.prepare("SELECT r.result_json FROM messages m JOIN runs r ON r.id=m.run_id AND r.user_id=m.user_id WHERE m.user_id=? AND m.id=? AND m.role='assistant'").get(userId, messageId);
        return row?.result_json ? JSON.parse(String(row.result_json)) as TurnResult : null;
    }
    getSource(userId: string, sourceId: string): Source | null { const row = this.db.prepare('SELECT * FROM sources WHERE user_id=? AND id=?').get(userId, sourceId) as Row | undefined; return row ? source(row) : null; }
    historicalSources(userId: string, ids: string[]): Source[] {
        if (!ids.length)
            return [];
        return (this.db.prepare(`SELECT DISTINCT s.* FROM sources s JOIN message_sources ms ON s.user_id=ms.user_id AND s.id=ms.source_id WHERE s.user_id=? AND ms.message_id IN (${ids.map(() => '?').join(',')}) ORDER BY s.observed_at DESC LIMIT 24`).all(userId, ...ids) as Row[]).map(source);
    }
    retrieve(userId: string, threadId: string, query: string, windows: DateWindow[], now: string, excludeId = ''): MemoryBundle {
        const scores = new Map<string, {
            message: Message;
            score: number;
        }>();
        let truncated = false, totalMatches = 0;
        const add = (rows: Row[], weight: number) => rows.forEach((row, index) => { const m = message(row); const old = scores.get(m.id); scores.set(m.id, { message: m, score: (old?.score ?? 0) + weight / (12 + index) }); });
        for (const w of windows) {
            const count = Number(this.db.prepare('SELECT COUNT(*) n FROM messages WHERE user_id=? AND created_at>=? AND created_at<? AND created_at<=? AND id<>?').get(userId, w.start, w.end, now, excludeId)!.n);
            totalMatches += count;
            truncated ||= count > 48;
            add(this.db.prepare('SELECT * FROM messages WHERE user_id=? AND created_at>=? AND created_at<? AND created_at<=? AND id<>? ORDER BY created_at,seq LIMIT 48').all(userId, w.start, w.end, now, excludeId) as Row[], 6);
        }
        // Quotes are constructed from tokens, never interpolated SQL or user FTS operators.
        const stop = new Set('what did ask you we the on is it still correct today since last has have any them about changed pricing answer monday tuesday wednesday thursday friday saturday sunday november'.split(' '));
        const tokens = [...new Set((query.match(/[\p{L}\p{N}]{2,}/gu) ?? []).map(t => t.toLowerCase()).filter(t => !stop.has(t)))].slice(0, 12);
        if (tokens.length) {
            const expression = tokens.map(t => `"${t.replaceAll('"', '')}"`).join(' OR ');
            add(this.db.prepare('SELECT m.* FROM messages_fts JOIN messages m ON messages_fts.rowid=m.seq WHERE messages_fts MATCH ? AND m.user_id=? AND m.created_at<=? AND m.id<>? ORDER BY bm25(messages_fts) LIMIT 24').all(expression, userId, now, excludeId) as Row[], 3);
        }
        add(this.db.prepare('SELECT * FROM messages WHERE user_id=? AND thread_id=? AND created_at<=? AND id<>? ORDER BY seq DESC LIMIT 10').all(userId, threadId, now, excludeId) as Row[], 1.5);
        add(this.db.prepare('SELECT * FROM messages WHERE user_id=? AND created_at<=? AND id<>? ORDER BY created_at DESC,seq DESC LIMIT 8').all(userId, now, excludeId) as Row[], 0.6);
        const ranked = [...scores.values()].sort((a, b) => b.score - a.score).slice(0, 32);
        const selected = new Map<string, Message>();
        let characters = 0;
        for (const entry of ranked) {
            const m = entry.message;
            const before = this.db.prepare('SELECT * FROM messages WHERE user_id=? AND thread_id=? AND seq<=? AND created_at<=? AND id<>? ORDER BY seq DESC LIMIT 2').all(userId, m.thread_id, m.seq, now, excludeId) as Row[];
            const after = this.db.prepare('SELECT * FROM messages WHERE user_id=? AND thread_id=? AND seq>? AND created_at<=? AND id<>? ORDER BY seq LIMIT 1').all(userId, m.thread_id, m.seq, now, excludeId) as Row[];
            const neighbors = [...before, ...after].sort((a, b) => Number(a.seq) - Number(b.seq));
            for (const r of neighbors) {
                const n = message(r);
                if (selected.has(n.id))
                    continue;
                if (characters + n.content.length > 48000 || selected.size >= 48) {
                    truncated = true;
                    continue;
                }
                selected.set(n.id, n);
                characters += n.content.length;
            }
        }
        if (scores.size > selected.size)
            truncated = true;
        const messages = [...selected.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.seq - b.seq);
        // Limit historical page excerpts, not original messages; preserve exact-source IDs/hashes.
        const historical_sources = this.historicalSources(userId, messages.map(m => m.id)).map(s => ({ ...s, content: s.content.slice(0, 4500), excerpted: s.content.length > 4500 }));
        return { messages, historical_sources, windows, truncated, total_matches: totalMatches };
    }
    deleteAll(userId: string): void {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            this.db.prepare('DELETE FROM message_sources WHERE user_id=?').run(userId);
            this.db.prepare('DELETE FROM sources WHERE user_id=?').run(userId);
            this.db.prepare('DELETE FROM messages WHERE user_id=?').run(userId);
            this.db.prepare('DELETE FROM runs WHERE user_id=?').run(userId);
            this.db.prepare('DELETE FROM threads WHERE user_id=?').run(userId);
            this.db.exec('COMMIT');
        }
        catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }
}
