import type { Answer, MemoryBundle, Message, Plan, Source, Comparison } from '../src/contracts.ts';
import { Store, digest } from '../src/memory/store.ts';
import { scope } from '../src/demo.ts';
export const now = '2026-11-11T09:00:00.000Z';
export function memoryFixture(): {
    memory: MemoryBundle;
    source: Source;
    plan: Plan;
    answer: Answer;
    comparison: Comparison;
} {
    const baseline: Message = { id: 'm_old', user_id: 'u_owner', thread_id: 't_old', seq: 1, role: 'assistant', content: 'Aster CRM Starter costs USD 20 per seat per month, billed monthly in the US.', created_at: '2026-11-09T09:00:00.000Z', answer: null };
    const old: Source = { id: 's_old', url: 'https://example.com/old', title: 'Old pricing', content: baseline.content, content_hash: digest(baseline.content), observed_at: '2026-11-09T08:59:00.000Z', published_at: null, query: 'Aster CRM pricing' };
    const content = 'Aster CRM Starter costs USD 24 per seat per month, billed monthly in the US. Effective 2026-11-10, the price increased from USD 20 to USD 24.';
    const source: Source = { ...old, id: 's_new', url: 'https://example.com/new', title: 'Current pricing', content, content_hash: digest(content), observed_at: now };
    const memory: MemoryBundle = { messages: [baseline], historical_sources: [old], windows: [], truncated: false, total_matches: 1 };
    const plan: Plan = { intent: 'revalidate', memory_ids: [baseline.id], subjects: ['Aster CRM'], required_checks: [{ subject: 'Aster CRM', topic: 'price' }], searches: [{ query: 'Aster CRM pricing', subject: 'Aster CRM', purpose: 'current', domains: [], since: null }], clarification: null, high_stakes: false, direct_answer: null };
    const comparison: Comparison = { subject: 'Aster CRM', topic: 'price', verdict: 'changed', before: baseline.content, baseline: { message_id: baseline.id, quote: baseline.content }, baseline_evidence: [{ source_id: old.id, quote: old.content }], now: content.split('. ')[0]!, evidence: [{ source_id: source.id, quote: content.split('. ')[0]! }], before_scope: scope(), now_scope: scope(), event_date: '2026-11-10', note: 'The archived and current observations support a price increase.' };
    const answer: Answer = { paragraphs: [], comparisons: [comparison], question: null };
    return { memory, source, plan, answer, comparison };
}
export function storeFixture() { const store = new Store(':memory:'); const { userId } = store.createUser(); const threadId = store.createThread(userId); return { store, userId, threadId }; }
