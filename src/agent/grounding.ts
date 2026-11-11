import type { Answer, MemoryBundle, Plan, Source, Scope } from '../contracts.ts';
import { safeUrl } from '../providers/search.ts';
const normalize = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();
export function hasQuote(text: string, quote: string, min = 8): boolean { const q = normalize(quote); return q.length >= min && normalize(text).includes(q); }
export function comparableScopes(a: Scope, b: Scope): boolean {
    const norm = (v: string | null) => v === null ? null : normalize(v).toLowerCase();
    return ['plan', 'currency', 'billing', 'unit', 'region'].every(k => !!a[k as keyof Scope] && !!b[k as keyof Scope]) && Object.keys(a).every(k => norm(a[k as keyof Scope]) === norm(b[k as keyof Scope]));
}
export function planErrors(plan: Plan, memory: MemoryBundle, request = ''): string[] {
    const errors: string[] = [];
    const ids = new Set(memory.messages.map(m => m.id));
    if (plan.direct_answer && (['research', 'revalidate'].includes(plan.intent) || plan.high_stakes))
        errors.push('Research and high-stakes questions cannot use the direct-answer fast lane');
    if (plan.memory_ids.some(i => !ids.has(i)))
        errors.push('Selected memory does not exist in supplied candidates');
    if (plan.intent === 'recall' && plan.searches.length)
        errors.push('Pure conversation recall must not search the web');
    if (['research', 'revalidate'].includes(plan.intent) && !plan.searches.length && !plan.clarification)
        errors.push('Research needs a search plan or a clear clarification');
    if (plan.intent === 'revalidate' && !plan.clarification) {
        if (!plan.memory_ids.length)
            errors.push('No historical baseline selected');
        if (!plan.subjects.length)
            errors.push('No actual historical subjects identified');
        for (const subject of plan.subjects) {
            const checks = plan.required_checks.filter(c => c.subject === subject);
            if (!checks.length)
                errors.push(`No verification target for ${subject}`);
            if (/pric|cost|billing/i.test(request) && !checks.some(c => c.topic === 'price'))
                errors.push(`Missing price check for ${subject}`);
            if (/shipped|releases?|features?/i.test(request) && !checks.some(c => c.topic === 'feature'))
                errors.push(`Missing feature check for ${subject}`);
        }
        for (const subject of plan.subjects)
            if (!plan.searches.some(q => normalize(q.subject).toLowerCase() === normalize(subject).toLowerCase()))
                errors.push(`No search coverage for ${subject}`);
    }
    for (const q of plan.searches) {
        if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b|\b(?:sk|tvly)-[A-Za-z0-9_-]{10,}/.test(q.query))
            errors.push('Private identifiers or credentials must not be sent to web search');
        if (q.since && !/^\d{4}-\d{2}-\d{2}$/.test(q.since))
            errors.push('Search date must be ISO');
    }
    return errors;
}
export function groundingErrors(answer: Answer, memory: MemoryBundle, sources: Source[], plan: Plan, now: string): string[] {
    const errors: string[] = [];
    const current = new Map(sources.map(s => [s.id, s]));
    const archive = new Map(memory.historical_sources.map(s => [s.id, s]));
    const messages = new Map(memory.messages.map(m => [m.id, m]));
    const checkEvidence = (refs: Answer['paragraphs'][number]['evidence'], pool: Map<string, Source>, label: string) => {
        for (const e of refs) {
            const s = pool.get(e.source_id);
            if (!s || !safeUrl(s.url) || !hasQuote(s.content, e.quote))
                errors.push(`${label}: missing source or non-verbatim evidence`);
        }
    };
    const checkMemory = (ref: {
        message_id: string;
        quote: string;
    }, label: string) => { const m = messages.get(ref.message_id); if (!m || !hasQuote(m.content, ref.quote, 3))
        errors.push(`${label}: missing message or non-verbatim memory`); };
    answer.paragraphs.forEach((p, i) => {
        if (p.kind === 'fact' && !p.evidence.length)
            errors.push(`paragraph ${i}: fact has no current evidence`);
        if (p.kind === 'memory' && !p.memories.length)
            errors.push(`paragraph ${i}: recall has no memory`);
        checkEvidence(p.evidence, current, `paragraph ${i}`);
        p.memories.forEach(m => checkMemory(m, `paragraph ${i}`));
    });
    answer.comparisons.forEach((c, i) => {
        const label = `comparison ${i}`;
        if (c.baseline)
            checkMemory(c.baseline, label);
        if (!c.baseline && c.verdict !== 'unknown')
            errors.push(`${label}: comparison needs an original baseline`);
        checkEvidence(c.evidence, current, label);
        checkEvidence(c.baseline_evidence, archive, label);
        if (['changed', 'still_supported', 'corrected', 'conflicting'].includes(c.verdict) && !c.evidence.length)
            errors.push(`${label}: positive verdict without fresh evidence`);
        if (c.verdict === 'conflicting' && new Set(c.evidence.map(e => e.source_id)).size < 2)
            errors.push(`${label}: conflict needs two sources`);
        if (c.topic === 'price' && ['changed', 'still_supported'].includes(c.verdict) && !comparableScopes(c.before_scope, c.now_scope))
            errors.push(`${label}: price scope is unknown or incomparable`);
        const baseline = c.baseline ? messages.get(c.baseline.message_id) : null;
        if (c.baseline_evidence.some(e => (archive.get(e.source_id)?.observed_at ?? '') > (baseline?.created_at ?? now)))
            errors.push(`${label}: baseline snapshot was observed after the original message`);
        if (c.event_date && (!/^\d{4}-\d{2}-\d{2}$/.test(c.event_date) || Number.isNaN(Date.parse(c.event_date))))
            errors.push(`${label}: invalid event date`);
        if (c.verdict === 'changed' && c.event_date && c.event_date > now.slice(0, 10))
            errors.push(`${label}: a future event cannot be an already completed change`);
        if (c.verdict === 'changed' && !c.baseline_evidence.length) {
            if (!c.event_date || !baseline || c.event_date <= baseline.created_at.slice(0, 10) || c.event_date > now.slice(0, 10))
                errors.push(`${label}: no verified historical snapshot or subsequent dated change`);
        }
    });
    if (plan.intent === 'revalidate')
        for (const check of plan.required_checks)
            if (!answer.comparisons.some(c => normalize(c.subject).toLowerCase() === normalize(check.subject).toLowerCase() && c.topic === check.topic))
                errors.push(`Missing ${check.topic} comparison/explicit unknown for ${check.subject}`);
    if (!answer.paragraphs.length && !answer.comparisons.length && !answer.question)
        errors.push('Empty answer');
    return errors;
}
/** Compact, source-preserving excerpts; never summarize evidence into invented quotations. */
export function excerpt(content: string, query: string, max = 3200): string {
    if (content.length <= max)
        return content;
    const terms = [...new Set((query.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []))].slice(0, 10);
    const lower = content.toLowerCase();
    const spans: Array<[
        number,
        number
    ]> = [[0, Math.min(1100, max)]];
    for (const term of terms) {
        const pos = lower.indexOf(term, 800);
        if (pos >= 0)
            spans.push([Math.max(0, pos - 240), Math.min(content.length, pos + 900)]);
    }
    spans.sort((a, b) => a[0] - b[0]);
    const merged: Array<[
        number,
        number
    ]> = [];
    for (const span of spans) {
        const last = merged.at(-1);
        if (last && span[0] <= last[1])
            last[1] = Math.max(last[1], span[1]);
        else
            merged.push(span);
    }
    let remaining = max;
    return merged.map(([start, end]) => { const part = content.slice(start, Math.min(end, start + remaining)); remaining -= part.length; return part; }).filter(Boolean).join('\n[…]\n');
}
