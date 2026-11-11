import type { Answer, Audit, Draft, MemoryBundle, Model, Plan, SearchQuery, Source, TraceEvent, TurnResult, Usage, WebSearch } from '../contracts.ts';
import { auditSchema, draftSchema, limitation, planSchema } from '../contracts.ts';
import { Store } from '../memory/store.ts';
import { resolveDates } from '../memory/time.ts';
import { Budget, parallelMap } from './budget.ts';
import { ANSWER, AUDIT, PLAN } from './prompts.ts';
import { excerpt, groundingErrors, planErrors } from './grounding.ts';
import { queryKey } from '../providers/search.ts';
export interface AgentInput {
    userId: string;
    threadId: string;
    messageId: string;
    text: string;
    timezone: string;
    now: Date;
}
export interface AgentOptions {
    store: Store;
    budget: Budget;
    model: Model;
    web: WebSearch;
    emit?: (event: string, data: unknown) => void;
    saveSources?: (sources: Source[]) => void;
}
export async function runAgent(input: AgentInput, options: AgentOptions): Promise<TurnResult> {
    const { store, budget, model, web } = options;
    budget.signal.throwIfAborted();
    const trace: TraceEvent[] = [];
    const usage: Usage[] = [];
    const warnings: string[] = [];
    const allSources: Source[] = [];
    let memory: MemoryBundle = { messages: [], historical_sources: [], windows: [], truncated: false, total_matches: 0 };
    const event = (phase: string, detail: Record<string, unknown> = {}) => { const item = { phase, detail, at: new Date().toISOString() }; trace.push(item); options.emit?.('status', item); };
    const finish = (answer: Answer): TurnResult => ({ answer, sources: allSources, historical_sources: memory.historical_sources, memories: memory.messages, trace, usage, warnings });
    const call = async <T>(stage: 'plan' | 'answer' | 'audit', instructions: string, data: unknown, schema: typeof planSchema): Promise<T> => {
        budget.signal.throwIfAborted();
        const r = await model.complete<T>({ stage, instructions, data, schema, signal: budget.signal });
        usage.push(r.usage);
        return r.value;
    };
    // Deliberately tiny zero-model fast lane. No broad heuristic can bypass freshness checks.
    if (/^(hi|hello|hey|thanks|thank you)[!.\s]*$/i.test(input.text.trim()))
        return finish({ paragraphs: [{ kind: 'reasoning', text: /thank/i.test(input.text) ? 'You’re welcome.' : 'Hi. What would you like to work through?', evidence: [], memories: [] }], comparisons: [], question: null });
    event('memory', { message: 'Finding the original discussion' });
    try {
        memory = store.retrieve(input.userId, input.threadId, input.text, resolveDates(input.text, input.now, input.timezone), input.now.toISOString(), input.messageId);
    }
    catch (error) {
        if (error instanceof Error && /timezone transition/.test(error.message))
            return finish(limitation('That date falls on an unusual timezone transition. Please give the calendar date and timezone explicitly.'));
        throw error;
    }
    if (memory.truncated)
        warnings.push('Memory retrieval was bounded; absence from this context does not prove a conversation never happened.');
    const context = { request: input.text, now: input.now.toISOString(), timezone: input.timezone, memory };
    event('planning', { message: 'Resolving the question and evidence needed', memory_matches: memory.messages.length, dates: memory.windows.map(w => w.local_date) });
    let plan = await call<Plan>('plan', PLAN, context, planSchema);
    let errors = planErrors(plan, memory, input.text);
    if (errors.length) {
        event('plan_repair', { message: 'Checking the research plan' });
        plan = await call<Plan>('plan', PLAN, { ...context, invalid_plan: plan, errors }, planSchema);
        errors = planErrors(plan, memory, input.text);
    }
    if (errors.length)
        return finish(limitation('I couldn’t reliably resolve the original discussion and research scope. Please name the tools or the exact discussion you want checked.'));
    if (plan.clarification)
        return finish(limitation('I need one detail to avoid checking the wrong thing.', plan.clarification));
    if (['recall', 'revalidate'].includes(plan.intent) && !plan.memory_ids.length)
        return finish(limitation('I couldn’t locate that discussion in the history available to this browser. I won’t guess what we discussed.', 'Which tools or earlier answer should I check?'));
    if (plan.direct_answer && !groundingErrors(plan.direct_answer, memory, [], plan, input.now.toISOString()).length) {
        event('complete', { message: 'Answer checked', search_requests: 0, model_requests: budget.counts.model });
        return finish(plan.direct_answer);
    }
    const selected = new Set(plan.memory_ids);
    // Keep selected history plus the current conversation tail. Preserve exact originals, not summaries.
    const recentIds = new Set(memory.messages.filter(m => m.thread_id === input.threadId).slice(-10).map(m => m.id));
    memory = { ...memory, messages: memory.messages.filter(m => selected.has(m.id) || recentIds.has(m.id)) };
    const attempted = new Set<string>();
    const failures: Array<{
        query: string;
        error: string;
    }> = [];
    let successfulSearches = 0;
    const research = async (queries: SearchQuery[]) => {
        const unique = queries.filter(q => { const key = queryKey(q); if (attempted.has(key))
            return false; attempted.add(key); return true; });
        event('searching', { message: 'Checking current sources', queries: unique.map(q => ({ query: q.query, subject: q.subject, purpose: q.purpose })) });
        const batches = await parallelMap(unique, 4, async (q) => {
            try {
                const sources = await web.search(q, budget.signal);
                successfulSearches++;
                event('search_complete', { subject: q.subject, purpose: q.purpose, sources: sources.length });
                return sources;
            }
            catch (error) {
                if (budget.signal.aborted)
                    throw error;
                const reason = error instanceof Error ? error.message : 'Search failed';
                failures.push({ query: q.query, error: reason });
                event('search_unavailable', { subject: q.subject, message: 'A source query could not be completed' });
                return [];
            }
        });
        for (const batch of batches)
            for (const s of batch) {
                if (!allSources.some(old => old.url === s.url && old.content_hash === s.content_hash)) {
                    allSources.push(s);
                    options.emit?.('source', { id: s.id, title: s.title, url: s.url, observed_at: s.observed_at, published_at: s.published_at });
                }
            }
        options.saveSources?.(allSources);
    };
    if (plan.searches.length)
        await research(plan.searches);
    if (failures.length)
        warnings.push(`${failures.length} web search request(s) failed; incomplete searches are not evidence of no change.`);
    if (plan.searches.length && !successfulSearches)
        return finish(limitation('Web search is unavailable right now. I can’t verify today’s facts or claim that nothing changed. Your original discussion has been preserved.'));
    const answerContext = () => ({
        request: input.text, now: input.now.toISOString(), timezone: input.timezone, plan, memory,
        sources: allSources.map(s => ({ ...s, content: excerpt(s.content, s.query, Math.max(1400, Math.floor(65000 / Math.max(allSources.length, 1)))) })),
        failed_searches: failures, successful_searches: successfulSearches, warnings,
        followup_allowed: budget.counts.model < 3 && budget.counts.search <= 10
    });
    event('synthesizing', { message: plan.intent === 'revalidate' ? 'Comparing then with now' : 'Writing an evidence-grounded answer' });
    let draft = await call<Draft>('answer', ANSWER, answerContext(), draftSchema);
    if (draft.followup_searches.length && budget.counts.model < 3 && budget.counts.search <= 10) {
        await research(draft.followup_searches.slice(0, 2));
        draft = await call<Draft>('answer', ANSWER, { ...answerContext(), followup_allowed: false }, draftSchema);
    }
    let grounding = groundingErrors(draft.answer, memory, allSources, plan, input.now.toISOString());
    if (grounding.length && budget.counts.model < 4) {
        event('grounding_repair', { message: 'Checking references and comparison scope' });
        draft = await call<Draft>('answer', ANSWER, { ...answerContext(), followup_allowed: false, previous_draft: draft.answer, validation_errors: grounding }, draftSchema);
        grounding = groundingErrors(draft.answer, memory, allSources, plan, input.now.toISOString());
    }
    if (grounding.length) {
        warnings.push('The generated answer failed structural provenance checks; unverified claims were withheld.');
        event('withheld', { reason: 'provenance_validation', errors: grounding });
        return finish(limitation('I found material to review, but couldn’t produce a reliably grounded comparison. I’m withholding the unverified conclusions rather than guessing. The sources I found are available below.'));
    }
    if (plan.intent === 'revalidate' || plan.high_stakes) {
        event('verifying', { message: 'Checking whether the evidence supports each conclusion' });
        try {
            const audit = await call<Audit>('audit', AUDIT, { ...answerContext(), answer: draft.answer }, auditSchema);
            if (audit.unsupported_paragraphs.length || audit.unsupported_comparisons.length) {
                event('evidence_gap', { paragraphs: audit.unsupported_paragraphs.length, comparisons: audit.unsupported_comparisons.length });
                // A second audit must fit as well; otherwise abstain rather than ship an unchecked repair.
                if (budget.counts.model <= 3) {
                    draft = await call<Draft>('answer', ANSWER, { ...answerContext(), followup_allowed: false, previous_draft: draft.answer, audit_feedback: audit }, draftSchema);
                    const after = groundingErrors(draft.answer, memory, allSources, plan, input.now.toISOString());
                    if (after.length)
                        throw new Error('Repaired answer is not structurally grounded');
                    const again = await call<Audit>('audit', AUDIT, { ...answerContext(), answer: draft.answer }, auditSchema);
                    if (again.unsupported_paragraphs.length || again.unsupported_comparisons.length)
                        throw new Error('Repaired answer has unsupported conclusions');
                }
                else
                    throw new Error('Not enough verification budget for a checked repair');
            }
        }
        catch (error) {
            if (budget.signal.aborted)
                throw error;
            warnings.push('Evidence verification did not complete successfully. No verified conclusion is asserted.');
            return finish(limitation('I located sources, but couldn’t verify the comparison confidently within this turn. I won’t label the earlier answer correct or changed without sufficient evidence.'));
        }
    }
    event('complete', { message: 'Answer checked', search_requests: budget.counts.search, model_requests: budget.counts.model });
    return finish(draft.answer);
}
