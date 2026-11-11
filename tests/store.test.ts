import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/memory/store.ts';
import { limitation } from '../src/contracts.ts';
import { dayWindow } from '../src/memory/time.ts';
import { memoryFixture, now, storeFixture } from './helpers.ts';
test('memory retrieval is isolated by server-owned user identity', () => { const { store, userId, threadId } = storeFixture(); try {
    const other = store.createUser();
    const t = store.createThread(other.userId);
    store.appendMessage(other.userId, t, 'user', 'Secret Postgres account', '2026-11-03T09:00:00Z');
    store.appendMessage(userId, threadId, 'user', 'Public Postgres question', '2026-11-03T09:00:00Z');
    const result = store.retrieve(userId, threadId, 'Postgres', [], now);
    assert.equal(result.messages.length, 1);
    assert(!result.messages[0]!.content.includes('Secret'));
}
finally {
    store.close();
} });
test('cross-thread recall retrieves exact original messages by local date', () => { const { store, userId, threadId } = storeFixture(); try {
    const t = store.createThread(userId);
    const old = store.appendMessage(userId, t, 'user', 'An obscure question without overlapping keywords', '2026-11-03T09:00:00.000Z');
    const r = store.retrieve(userId, threadId, 'What did I ask on 3 November?', [dayWindow('2026-11-03', 'UTC')], now);
    assert(r.messages.some(m => m.id === old.id));
}
finally {
    store.close();
} });
test('neighbor expansion stays within the thread even with interleaved writes', () => { const { store, userId, threadId } = storeFixture(); try {
    const other = store.createThread(userId);
    const q = store.appendMessage(userId, threadId, 'user', 'Compare ZephyrDB', '2026-01-01T00:00:00.000Z');
    for (let i = 0; i < 5; i++)
        store.appendMessage(userId, other, 'user', `unrelated ${i}`, '2026-01-01T00:00:00.000Z');
    const a = store.appendMessage(userId, threadId, 'assistant', 'The original contextual answer.', '2026-01-01T00:00:01.000Z');
    const r = store.retrieve(userId, other, 'ZephyrDB', [], now);
    assert(r.messages.some(m => m.id === q.id));
    assert(r.messages.some(m => m.id === a.id));
}
finally {
    store.close();
} });
test('current request is never its own historical baseline and future history is excluded', () => { const { store, userId, threadId } = storeFixture(); try {
    const current = store.appendMessage(userId, threadId, 'user', 'The five products were …', now);
    store.appendMessage(userId, threadId, 'user', 'Future answer', '2027-01-01T00:00:00.000Z');
    assert.equal(store.retrieve(userId, threadId, 'five products', [], now, current.id).messages.length, 0);
}
finally {
    store.close();
} });
test('user FTS operators and quotes cannot inject SQL or break the query', () => { const { store, userId, threadId } = storeFixture(); try {
    store.appendMessage(userId, threadId, 'user', 'Postgres hosting', now);
    assert.doesNotThrow(() => store.retrieve(userId, threadId, `" OR * ); DROP TABLE messages; -- Postgres`, [], now));
    assert.equal(store.listMessages(userId, threadId).length, 1);
}
finally {
    store.close();
} });
test('bounded history explicitly discloses truncation', () => { const { store, userId, threadId } = storeFixture(); try {
    for (let i = 0; i < 70; i++)
        store.appendMessage(userId, threadId, 'user', `Question ${i}`, '2026-11-03T09:00:00.000Z');
    const r = store.retrieve(userId, threadId, '3 November', [dayWindow('2026-11-03', 'UTC')], now);
    assert(r.truncated);
    assert.equal(r.total_matches, 70);
    assert(r.messages.length <= 48);
}
finally {
    store.close();
} });
test('raw history and FTS index survive process-level reopen', () => { const dir = mkdtempSync(join(tmpdir(), 'then-now-')); try {
    const path = join(dir, 'test.sqlite');
    let s = new Store(path);
    const u = s.createUser();
    const t = s.createThread(u.userId);
    const m = s.appendMessage(u.userId, t, 'user', 'Remember the Nebula shortlist', now);
    s.close();
    s = new Store(path);
    assert.equal(s.userFromToken(u.token), u.userId);
    assert(s.retrieve(u.userId, t, 'Nebula', [], now).messages.some(v => v.id === m.id));
    s.close();
}
finally {
    rmSync(dir, { recursive: true, force: true });
} });
test('only one active run can exist per conversation; begin is atomic', () => { const { store, userId, threadId } = storeFixture(); try {
    store.beginRun(userId, threadId, 'request-a', 'first', now);
    assert.throws(() => store.beginRun(userId, threadId, 'request-b', 'second', now));
    assert.equal(store.listMessages(userId, threadId).length, 1);
}
finally {
    store.close();
} });
test('completed run stores answer and result together for idempotent replay', () => { const { store, userId, threadId } = storeFixture(); try {
    const { run } = store.beginRun(userId, threadId, 'request-a', 'hello', now);
    store.completeRun(run, { answer: limitation('Hello'), sources: [], historical_sources: [], memories: [], trace: [], usage: [], warnings: [] }, now);
    assert.equal(store.runByKey(userId, 'request-a')?.status, 'complete');
    assert.equal(store.listMessages(userId, threadId).length, 2);
    assert.throws(() => store.beginRun(userId, threadId, 'request-a', 'hello', now));
}
finally {
    store.close();
} });
test('restart recovery marks interrupted runs failed, not complete', () => { const { store, userId, threadId } = storeFixture(); try {
    store.beginRun(userId, threadId, 'request-a', 'hello', now);
    store.recover();
    assert.equal(store.runByKey(userId, 'request-a')?.status, 'failed');
    assert.equal(store.listMessages(userId, threadId).length, 1);
}
finally {
    store.close();
} });
test('snapshots are immutable and the same source ID is isolated per owner', () => { const { store, userId } = storeFixture(); try {
    const { source } = memoryFixture();
    store.saveSources(userId, null, [source]);
    store.saveSources(userId, null, [{ ...source, content: 'overwritten' }]);
    const other = store.createUser();
    store.saveSources(other.userId, null, [{ ...source, content: 'other owner' }]);
    assert.equal(store.db.prepare('SELECT content FROM sources WHERE user_id=? AND id=?').get(userId, source.id)?.content, source.content);
}
finally {
    store.close();
} });
test('forget removes indexed messages, saved evidence, and runs', () => { const { store, userId, threadId } = storeFixture(); try {
    store.appendMessage(userId, threadId, 'user', 'secret', now);
    store.saveSources(userId, null, [memoryFixture().source]);
    store.deleteAll(userId);
    assert.equal(store.listThreads(userId).length, 0);
    assert.equal(store.retrieve(userId, threadId, 'secret', [], now).messages.length, 0);
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM sources WHERE user_id=?').get(userId)?.n, 0);
}
finally {
    store.close();
} });
test('browser session tokens are opaque and stored only as hashes', () => { const s = new Store(':memory:'); try {
    const u = s.createUser();
    assert.equal(s.userFromToken(u.token), u.userId);
    assert.equal(s.userFromToken(u.userId), null);
    const row = s.db.prepare('SELECT * FROM users WHERE id=?').get(u.userId)!;
    assert(!Object.values(row).includes(u.token));
}
finally {
    s.close();
} });
