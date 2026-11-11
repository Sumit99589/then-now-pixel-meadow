import { createSprite } from './pixel-art.js';
import { initMeadow, readPreference, savePreference } from './meadow.js';

const $ = id => document.getElementById(id);
const state = { thread: null, busy: false, controller: null, session: null, sourceCount: 0, loading: true, loadVersion: 0 };
const meadow = initMeadow();
$('send').disabled = true;
const el = (tag, className, text) => { const node = document.createElement(tag); if (className)
    node.className = className; if (text !== undefined)
    node.textContent = text; return node; };
async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...options.headers } });
    const data = await response.json();
    if (!response.ok)
        throw new Error(data.error || 'Request failed');
    return data;
}
const date = value => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: $('timezone').value || 'UTC' });
function safeLink(url) { try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '#';
}
catch {
    return '#';
} }
function setBusy(busy) {
    state.busy = busy;
    $('send').disabled = busy;
    $('new-chat').disabled = busy;
    $('clear-memory').disabled = busy;
    for (const button of $('threads').querySelectorAll('button')) button.disabled = busy;
    $('stop').hidden = !busy;
    $('activity').hidden = !busy;
    meadow.setBusy(busy);
}
function errorMessage(text) { const notice = el('div', 'error-message', text); notice.setAttribute('role', 'alert'); $('messages').append(notice); }
function scrollToBottom() { window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }); }
async function showSource(source, quote) {
    if (source.excerpted) {
        try {
            const full = await api(`/api/sources/${encodeURIComponent(source.id)}`);
            source = { ...full, excerpted: false };
        }
        catch { /* The already-validated quotation remains available. */ }
    }
    $('dialog-title').textContent = 'EVIDENCE, NOT JUST A LINK';
    const box = $('evidence-content');
    box.replaceChildren();
    box.append(el('h2', '', source.title));
    const link = el('a', '', source.url);
    link.href = safeLink(source.url);
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    box.append(link);
    box.append(el('blockquote', '', quote));
    box.append(el('p', '', `Observed: ${date(source.observed_at)}\nPublication date: ${source.published_at || 'Not supplied'}\nRetrieval time is not the event date. Search-provider snapshots may be incomplete or cached.`));
    const details = el('details');
    details.append(el('summary', '', 'Captured source excerpt'));
    details.append(el('pre', '', source.content || 'No additional text.'));
    box.append(details);
    $('evidence-dialog').showModal();
}
function sourceButton(ref, result) {
    const sources = [...(result.sources || []), ...(result.historical_sources || [])];
    const source = sources.find(s => s.id === ref.source_id);
    const b = el('button', 'citation', source ? String(sources.indexOf(source) + 1) : 'source');
    b.type = 'button';
    b.title = source?.title || 'Source';
    b.setAttribute('aria-label', `Show source: ${source?.title || 'evidence'}`);
    if (source)
        b.addEventListener('click', () => showSource(source, ref.quote));
    else
        b.disabled = true;
    return b;
}
function memoryButton(ref, result) {
    const message = result.memories?.find(m => m.id === ref.message_id);
    const b = el('button', 'citation memory-citation', message ? date(message.created_at) : 'earlier');
    b.type = 'button';
    b.title = 'Read the exact original message';
    b.addEventListener('click', () => {
        $('dialog-title').textContent = 'THE ORIGINAL THREAD';
        const box = $('evidence-content');
        box.replaceChildren();
        box.append(el('h2', '', 'The original conversation'));
        box.append(el('p', '', message ? `${message.role === 'assistant' ? 'Assistant' : 'You'} · ${date(message.created_at)}` : 'Original reference'));
        box.append(el('blockquote', '', ref.quote));
        if (message)
            box.append(el('pre', '', message.content));
        box.append(el('p', '', 'This establishes what was said, not whether the statement was correct.'));
        $('evidence-dialog').showModal();
    });
    return b;
}
function userMessage(text) { meadow.setView(true); const article = el('article', 'message user'); article.append(el('div', 'user-text', text)); $('messages').append(article); }
const verdicts = { changed: 'CHANGE VERIFIED', still_supported: 'SUPPORTED NOW', corrected: 'PRIOR ANSWER NEEDS REVISION', no_change_found: 'NO CHANGE FOUND', unknown: 'NOT VERIFIED', conflicting: 'SOURCES DISAGREE' };
function assistantMessage(result) {
    meadow.setView(true);
    const article = el('article', 'message assistant');
    const label = el('div', 'assistant-label');
    const avatar = el('span', 'assistant-avatar');
    avatar.setAttribute('data-current-buddy', '');
    const labelText = el('span', 'assistant-label-text');
    labelText.append(el('span', '', 'then / now'), el('small', '', 'YOUR CURIOUS COMPANION'));
    label.append(avatar, labelText);
    meadow.paintBuddy(label);
    article.append(label);
    const content = el('div', 'assistant-content');
    const answer = result.answer;
    for (const block of answer.paragraphs || []) {
        const p = el('p', block.kind, block.text);
        for (const ref of block.evidence || [])
            p.append(sourceButton(ref, result));
        for (const ref of block.memories || [])
            p.append(memoryButton(ref, result));
        content.append(p);
    }
    if (answer.comparisons?.length) {
        const comparisons = el('div', 'comparisons');
        for (const item of answer.comparisons) {
            const card = el('section', 'comparison');
            const head = el('div', 'comparison-head');
            const title = el('div', 'comparison-title');
            title.append(el('h3', '', item.subject));
            if (item.topic) title.append(el('span', 'comparison-topic', ({price: 'PRICING', feature: 'FEATURES', other: 'DETAILS'})[item.topic] || item.topic));
            head.append(title, el('span', `verdict ${item.verdict}`, verdicts[item.verdict] || item.verdict));
            card.append(head);
            const columns = el('div', 'before-after');
            const before = el('div');
            before.append(el('div', 'cell-label', 'THEN'));
            const bp = el('p', '', item.before);
            if (item.baseline)
                bp.append(memoryButton(item.baseline, result));
            for (const ref of item.baseline_evidence || [])
                bp.append(sourceButton(ref, result));
            before.append(bp);
            const now = el('div');
            now.append(el('div', 'cell-label', 'NOW'));
            const np = el('p', '', item.now);
            for (const ref of item.evidence || [])
                np.append(sourceButton(ref, result));
            now.append(np);
            columns.append(before, now);
            card.append(columns);
            if (item.note)
                card.append(el('p', 'comparison-note', item.note));
            comparisons.append(card);
        }
        content.append(comparisons);
    }
    if (answer.question)
        content.append(el('p', 'question', answer.question));
    if (result.trace?.length) {
        const meta = el('div', 'answer-meta');
        const sources = result.sources || [];
        if (sources.length)
            meta.append(el('span', '', `${sources.length} source${sources.length === 1 ? '' : 's'} found`));
        const dates = [...new Set((result.memories || []).map(m => m.created_at.slice(0, 10)))];
        if (dates.length)
            meta.append(el('span', '', `${dates.length} discussion date${dates.length === 1 ? '' : 's'} retrieved`));
        const verified = result.trace.some(t => t.phase === 'verifying');
        if (verified)
            meta.append(el('span', '', 'Evidence check attempted'));
        content.append(meta);
    }
    if (result.sources?.length) {
        const details = el('details', 'audit-details');
        details.append(el('summary', '', `Research sources · ${result.sources.length}`));
        const list = el('div', 'audit-list');
        for (const source of result.sources) {
            const a = el('a', '', source.title);
            a.href = safeLink(source.url);
            a.target = '_blank';
            a.rel = 'noreferrer noopener';
            list.append(a, el('small', '', `Observed ${date(source.observed_at)} · ${new URL(source.url).hostname}`));
        }
        details.append(list);
        content.append(details);
    }
    if (result.trace?.length) {
        const details = el('details', 'audit-details');
        details.append(el('summary', '', 'How this answer was checked'));
        const list = el('div', 'audit-list');
        for (const step of result.trace) {
            const row = el('div', 'trace-row');
            row.append(el('span', '', step.detail?.message || step.phase.replaceAll('_', ' ')), el('code', '', step.phase));
            list.append(row);
        }
        const usage = result.usage || [];
        const total = usage.reduce((sum, u) => sum + u.input_tokens + u.output_tokens, 0);
        list.append(el('small', '', `${usage.length} model responses · ${total.toLocaleString()} reported tokens · no private reasoning shown`));
        details.append(list);
        content.append(details);
    }
    for (const warning of result.warnings || [])
        content.append(el('p', 'warning-line', warning));
    article.append(content);
    $('messages').append(article);
}
function filterThreads() {
    const query = $('thread-search').value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const button of $('threads').querySelectorAll('.thread')) {
        button.hidden = !button.dataset.title.includes(query);
        if (!button.hidden) visible++;
    }
    $('no-threads').hidden = visible > 0 || !query;
}
async function refreshThreads() {
    const session = await api('/api/session');
    state.session = session;
    const list = $('threads');
    list.replaceChildren();
    $('thread-count').textContent = String(session.threads.length);
    const active = session.threads.find(thread => thread.id === state.thread);
    $('current-trail').textContent = !active || active.title === 'New conversation' ? 'A fresh trail' : active.title;
    const animals = ['cat', 'turtle', 'bird', 'dog', 'bunny', 'fox'];
    for (const [index, thread] of session.threads.entries()) {
        const button = el('button', `thread${state.thread === thread.id ? ' active' : ''}`);
        button.type = 'button'; button.title = thread.title;
        button.dataset.title = thread.title.toLocaleLowerCase();
        button.disabled = state.busy;
        if (state.thread === thread.id) button.setAttribute('aria-current', 'page');
        const art = el('span', 'thread-art'); art.append(createSprite(animals[index % animals.length]));
        const copy = el('span', 'thread-copy');
        const timestamp = el('time', '', date(thread.updated_at)); timestamp.dateTime = thread.updated_at;
        copy.append(el('strong', '', thread.title), timestamp);
        button.append(art, copy);
        button.addEventListener('click', () => {
            if (!state.busy) { meadow.closeSidebar(); loadThread(thread.id).catch(e => errorMessage(e.message)); }
        });
        list.append(button);
    }
    filterThreads();
}
async function loadThread(threadId) {
    const version = ++state.loadVersion;
    state.loading = true;
    $('send').disabled = true;
    try {
        const { messages } = await api(`/api/messages?thread_id=${encodeURIComponent(threadId)}`);
        if (version !== state.loadVersion) return;
        state.thread = threadId;
        savePreference('tn_thread', threadId);
        $('messages').replaceChildren();
        meadow.setView(messages.length > 0);
        for (const message of messages)
            if (message.role === 'user') userMessage(message.content);
            else if (message.result) assistantMessage(message.result);
            else assistantMessage({ answer: { paragraphs: [{ kind: 'reasoning', text: message.content }], comparisons: [] } });
        await refreshThreads();
        if (messages.length) scrollToBottom();
        else window.scrollTo({ top: 0, behavior: 'instant' });
    } finally {
        if (version === state.loadVersion) { state.loading = false; $('send').disabled = state.busy; }
    }
}
async function newThread() {
    if (state.busy) return;
    $('new-chat').disabled = true;
    try {
        const { id } = await api('/api/threads', { method: 'POST', body: '{}' });
        $('thread-search').value = '';
        meadow.closeSidebar();
        await loadThread(id);
    } finally { $('new-chat').disabled = state.busy; }
}
async function send(text) {
    if (state.busy || state.loading || !text.trim())
        return;
    if (!state.thread)
        await newThread();
    userMessage(text);
    $('input').value = '';
    $('input').style.height = '';
    setBusy(true);
    state.sourceCount = 0;
    $('activity-count').textContent = '';
    $('activity-text').textContent = 'Finding the right context';
    scrollToBottom();
    const controller = new AbortController();
    state.controller = controller;
    let receivedAnswer = false;
    try {
        const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ thread_id: state.thread, text, request_id: crypto.randomUUID(), timezone: $('timezone').value }), signal: controller.signal });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Request failed');
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            let boundary;
            while ((boundary = buffer.indexOf('\n\n')) !== -1) {
                const frame = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                if (frame.startsWith(':'))
                    continue;
                const event = frame.split('\n').find(l => l.startsWith('event: '))?.slice(7);
                const dataLine = frame.split('\n').find(l => l.startsWith('data: '));
                if (!dataLine)
                    continue;
                const payload = JSON.parse(dataLine.slice(6));
                if (event === 'status') {
                    $('activity-text').textContent = payload.detail?.message || payload.phase.replaceAll('_', ' ');
                    $('activity').dataset.phase = payload.phase;
                }
                if (event === 'source') {
                    state.sourceCount++;
                    $('activity-count').textContent = `${state.sourceCount} sources`;
                }
                if (event === 'answer') {
                    receivedAnswer = true;
                    assistantMessage(payload);
                    $('activity').hidden = true;
                    scrollToBottom();
                }
                if (event === 'error')
                    throw new Error(payload.error);
            }
        }
        if (!receivedAnswer)
            throw new Error('The connection ended before a checked answer arrived. Your question was retained.');
    }
    catch (error) {
        errorMessage(controller.signal.aborted ? 'Stopped. No unfinished answer was saved.' : error.message);
        if (!receivedAnswer) { $('input').value = text; resizeInput(); }
    }
    finally {
        setBusy(false);
        state.controller = null;
        await refreshThreads().catch(() => { });
        $('input').focus();
    }
}
$('composer').addEventListener('submit', event => { event.preventDefault(); send($('input').value).catch(e => errorMessage(e.message)); });
$('input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $('composer').requestSubmit();
} });
function resizeInput() { $('input').style.height = 'auto'; $('input').style.height = Math.min($('input').scrollHeight, 180) + 'px'; }
$('input').addEventListener('input', resizeInput);
$('stop').addEventListener('click', () => state.controller?.abort());
$('new-chat').addEventListener('click', () => newThread().catch(e => errorMessage(e.message)));
$('timezone').addEventListener('change', () => { try {
    new Intl.DateTimeFormat('en', { timeZone: $('timezone').value }).format();
    savePreference('tn_timezone', $('timezone').value);
    refreshThreads().catch(e => errorMessage(e.message));
}
catch {
    errorMessage('Enter a valid IANA timezone, such as Asia/Kolkata.');
    $('timezone').value = state.session.timezone;
} });
$('clear-memory').addEventListener('click', async () => { if (state.busy || !confirm('Delete all conversations and saved sources for this browser session from this server?'))
    return; try {
    await api('/api/memory', { method: 'DELETE' });
    state.thread = null;
    savePreference('tn_thread', null);
    await newThread();
}
catch (e) {
    errorMessage(e.message);
} });
$('close-dialog').addEventListener('click', () => $('evidence-dialog').close());
$('thread-search').addEventListener('input', filterThreads);
$('evidence-dialog').addEventListener('click', event => {
    const dialog = $('evidence-dialog');
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
});
for (const button of document.querySelectorAll('[data-prompt]'))
    button.addEventListener('click', () => { $('input').value = button.dataset.prompt; resizeInput(); $('input').focus(); });
async function init() {
    const session = await api('/api/session');
    state.session = session;
    const preferredZone = readPreference('tn_timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone || session.timezone;
    try { new Intl.DateTimeFormat('en', { timeZone: preferredZone }).format(); $('timezone').value = preferredZone; }
    catch { $('timezone').value = session.timezone; savePreference('tn_timezone', null); }
    $('mode-label').dataset.mode = session.mode;
    $('mode-label').textContent = 'LIVE WEB';
    if (session.mode === 'offline-fixture') {
        $('mode-label').textContent = 'OFFLINE DEMO';
        $('notice').hidden = false;
        $('notice').textContent = 'Offline demo · synthetic companies and prices · clock fixed to 11 November 2026 · no live web search. Try the CRM example below.';
    }
    else if (!session.configured) {
        $('mode-label').textContent = 'KEYS NEEDED';
        $('mode-label').dataset.mode = 'unconfigured';
        $('notice').hidden = false;
        $('notice').textContent = 'Add OPENAI_API_KEY and TAVILY_API_KEY to .env for live answers. Use npm run demo to explore clearly labelled offline fixtures.';
    }
    const saved = readPreference('tn_thread');
    if (saved && session.threads.some(t => t.id === saved))
        await loadThread(saved);
    else
        await newThread();
}
init().catch(error => { state.loading = false; $('notice').hidden = false; $('notice').textContent = error.message; $('mode-label').textContent = 'CONNECTION ERROR'; $('mode-label').dataset.mode = 'unconfigured'; });
