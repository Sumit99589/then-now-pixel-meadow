/** Synthetic fixtures only. No real vendor pricing and no network calls. */
import type { Model, WebSearch, Plan, Draft, Audit, Source, SearchQuery, MemoryBundle, Scope, Comparison } from './contracts.ts';
import { emptyScope, limitation } from './contracts.ts';
import { Store, digest, id } from './memory/store.ts';
import type { Budget } from './agent/budget.ts';
export const DEMO_NOW = new Date('2026-11-11T09:00:00.000Z');
export const VENDORS = ['Aster CRM', 'Birch CRM', 'Cedar CRM', 'Driftwood CRM', 'Elm CRM'];
const prices = [20, 30, 15, 12, 40];
const slug = (s: string) => s.toLowerCase().replaceAll(' ', '-');
export const scope = (): Scope => ({ plan: 'Starter', currency: 'USD', billing: 'monthly', unit: 'per seat per month', region: 'US' });
export function fixtureSource(subject: string, old = false): Source {
    const index = VENDORS.indexOf(subject);
    const price = index < 0 ? 19 : prices[index]! + (index === 0 && !old ? 4 : 0);
    const content = `SYNTHETIC TEST FIXTURE. ${subject} Starter plan costs USD ${price} per seat per month, billed monthly in the US. ${subject === 'Aster CRM' && !old ? 'Effective 2026-11-10, Aster CRM increased the Starter price from USD 20 to USD 24 per seat per month.' : ''}`;
    return { id: id('s'), url: `https://example.com/fixtures/${slug(subject)}/${old ? '2026-11-09' : '2026-11-11'}`, title: `Fixture: ${subject} pricing`, content, content_hash: digest(content), observed_at: old ? '2026-11-09T08:59:00.000Z' : DEMO_NOW.toISOString(), published_at: old ? '2026-11-09' : '2026-11-11', query: `${subject} pricing` };
}
export function seedDemo(store: Store, userId: string): void {
    if (store.listThreads(userId).length)
        return;
    const thread = store.createThread(userId, 'Monday’s CRM shortlist', '2026-11-09T09:00:00.000Z');
    store.appendMessage(userId, thread, 'user', 'We are a 20-person sales team. Shortlist five CRM tools: Aster CRM, Birch CRM, Cedar CRM, Driftwood CRM, and Elm CRM. Compare their Starter prices in USD per seat, billed monthly in the US.', '2026-11-09T09:00:00.000Z');
    const original = VENDORS.map((v, i) => `${v}: USD ${prices[i]} per seat per month, Starter plan, monthly billing, US.`).join('\n');
    const msg = store.appendMessage(userId, thread, 'assistant', original, '2026-11-09T09:00:02.000Z');
    const sources = VENDORS.map(v => fixtureSource(v, true));
    store.saveSources(userId, null, sources);
    for (const s of sources)
        store.db.prepare('INSERT INTO message_sources VALUES (?,?,?)').run(userId, msg.id, s.id);
    const other = store.createThread(userId, 'Postgres hosting question', '2026-11-03T10:00:00.000Z');
    store.appendMessage(userId, other, 'user', 'How should I compare managed Postgres hosting for a small project?', '2026-11-03T10:00:00.000Z');
    store.appendMessage(userId, other, 'assistant', 'Compare compute, storage, connection limits, backups, bandwidth, and the cost of scaling. A low base price may exclude usage charges.', '2026-11-03T10:00:01.000Z');
}
export class DemoSearch implements WebSearch {
    private budget: Budget;
    constructor(budget: Budget) { this.budget = budget; }
    async search(q: SearchQuery, signal: AbortSignal): Promise<Source[]> { this.budget.take('search'); signal.throwIfAborted(); return [fixtureSource(q.subject)]; }
}
export class DemoModel implements Model {
    private budget: Budget;
    constructor(budget: Budget) { this.budget = budget; }
    async complete<T>(args: Parameters<Model['complete']>[0]): Promise<{
        value: T;
        usage: {
            model: string;
            input_tokens: number;
            output_tokens: number;
            elapsed_ms: number;
        };
    }> {
        this.budget.take('model');
        args.signal.throwIfAborted();
        const data = args.data as {
            request: string;
            memory: MemoryBundle;
            plan?: Plan;
            sources?: Source[];
        };
        let value: Plan | Draft | Audit;
        if (args.stage === 'plan') {
            const crm = /crm|shortlist|five|5 tools/i.test(data.request);
            const old = data.memory.messages.filter(m => crm ? /Aster CRM/.test(m.content) : /Postgres|compute, storage/i.test(m.content));
            const revalidate = /still|changed|since|correct|pricing/i.test(data.request);
            const subjects = crm ? VENDORS : ['Managed Postgres hosting'];
            value = { intent: revalidate ? 'revalidate' : 'recall', memory_ids: old.map(m => m.id), subjects: revalidate ? subjects : [], required_checks: revalidate ? subjects.flatMap(subject => [{ subject, topic: crm || /pric|cost|billing/i.test(data.request) ? 'price' as const : 'other' as const }, ...(/shipped|release|feature/i.test(data.request) ? [{ subject, topic: 'feature' as const }] : [])]) : [], searches: revalidate ? subjects.map(subject => ({ query: `${subject} official pricing`, subject, purpose: 'current', domains: [], since: null })) : [], clarification: old.length ? null : 'This offline demo contains a Monday CRM shortlist and a 3 November Postgres discussion. Which would you like to revisit?', high_stakes: false, direct_answer: null };
        }
        else if (args.stage === 'audit')
            value = { unsupported_paragraphs: [], unsupported_comparisons: [], explanation: 'Synthetic fixture contract only; not a live semantic evaluation.' };
        else {
            const plan = data.plan!;
            const base = data.memory.messages.find(m => m.role === 'assistant' && m.content.includes('Aster CRM'));
            if (plan.intent === 'revalidate' && base && plan.subjects.includes('Aster CRM')) {
                const comparisons: Comparison[] = plan.subjects.map((subject, index) => {
                    const fresh = data.sources!.find(s => s.title.includes(subject))!;
                    const old = data.memory.historical_sources.find(s => s.title.includes(subject));
                    const line = base.content.split('\n').find(l => l.startsWith(subject))!;
                    const quote = fresh.content.match(new RegExp(`${subject} Starter plan costs[^.]+\\.`))![0];
                    const oldQuote = old?.content.match(new RegExp(`${subject} Starter plan costs[^.]+\\.`))?.[0];
                    return { subject, topic: 'price', verdict: index === 0 ? 'changed' : 'still_supported', before: line, baseline: { message_id: base.id, quote: line }, baseline_evidence: old && oldQuote ? [{ source_id: old.id, quote: oldQuote }] : [], now: quote, evidence: [{ source_id: fresh.id, quote }], before_scope: scope(), now_scope: scope(), event_date: index === 0 ? '2026-11-10' : null, note: index === 0 ? 'The fixture records an increase after the 9 November shortlist.' : 'The current fixture supports the prior price. This does not prove there were no intermediate changes.' };
                });
                for (const check of plan.required_checks.filter(c => c.topic === 'feature'))
                    comparisons.push({ subject: check.subject, topic: 'feature', verdict: 'unknown', before: 'The original shortlist did not establish a feature baseline.', baseline: null, baseline_evidence: [], now: 'The synthetic fixture contains no release evidence.', evidence: [], before_scope: emptyScope(), now_scope: emptyScope(), event_date: null, note: 'No conclusion about shipped features can be drawn from pricing evidence.' });
                value = { answer: { paragraphs: [{ kind: 'limitation', text: 'Offline fixture: synthetic companies and prices. No live web search was performed.', evidence: [], memories: [] }], comparisons, question: null }, followup_searches: [] };
            }
            else if (plan.intent === 'recall') {
                const messages = data.memory.messages.filter(m => m.role === 'user' && plan.memory_ids.includes(m.id));
                value = { answer: { paragraphs: messages.map(m => ({ kind: 'memory', text: `On ${m.created_at.slice(0, 10)}, you asked: ${m.content}`, evidence: [], memories: [{ message_id: m.id, quote: m.content.slice(0, 650) }] })), comparisons: [], question: null }, followup_searches: [] };
            }
            else {
                value = { answer: { ...limitation('This is a synthetic offline example, not a live answer.'), comparisons: plan.required_checks.map(check => ({ subject: check.subject, topic: check.topic, verdict: 'unknown', before: 'The earlier discussion is available.', baseline: null, baseline_evidence: [], now: 'The offline fixture cannot check real Postgres providers.', evidence: [], before_scope: emptyScope(), now_scope: emptyScope(), event_date: null, note: 'Add API keys and run in live mode to verify current information.' })) }, followup_searches: [] };
            }
        }
        return { value: value as T, usage: { model: 'offline-fixture', input_tokens: 0, output_tokens: 0, elapsed_ms: 0 } };
    }
}
