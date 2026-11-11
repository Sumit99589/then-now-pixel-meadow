/** Opt-in real-provider smoke evaluation. Persists full outputs for human grading.
 * It intentionally does not use an LLM judge to declare itself "correct". */
import { mkdirSync, writeFileSync } from 'node:fs';
import { config } from '../src/config.ts';
import { Store } from '../src/memory/store.ts';
import { Budget } from '../src/agent/budget.ts';
import { runAgent } from '../src/agent/agent.ts';
import { OpenAIModel } from '../src/providers/openai.ts';
import { TavilySearch } from '../src/providers/search.ts';
import { shiftDay, localDate, midnight } from '../src/memory/time.ts';
const cfg = config();
if (process.env.RUN_LIVE_EVALS !== '1')
    throw new Error('Set RUN_LIVE_EVALS=1 to explicitly permit paid model and search requests.');
if (!cfg.openaiKey || !cfg.tavilyKey)
    throw new Error('Both API keys are required.');
const now = new Date();
const day = shiftDay(localDate(now, cfg.timezone), -7);
const historicalTime = midnight(day, cfg.timezone);
const cases = [
    { id: 'missing-memory', history: false, text: 'On Monday we shortlisted five CRM tools. Has any pricing changed since?', criteria: ['Do not invent the five tools.', 'Ask for the missing list or acknowledge inaccessible history.', 'Do not search the web for private conversation history.'] },
    { id: 'exact-recall', history: true, text: `What did I ask you on ${day}?`, criteria: ['Retrieve the exact historical Postgres question.', 'No web search is necessary for pure recall.', 'Attribute the earlier answer as a prior statement, not verified external truth.'] },
    { id: 'revalidate-without-old-prices', history: true, text: `On ${day} we shortlisted Postgres hosting. Has any pricing changed since then?`, criteria: ['Preserve Neon, Supabase, and Render.', 'Check current official pricing without excluding undated pages.', 'Do not invent old prices. A real change needs dated evidence.', 'Record unknowns; do not turn no result into unchanged.', 'Check usage pricing, plan names, minimum spend, included quotas, and billing periods.'] }
];
const reports: unknown[] = [];
for (const scenario of cases) {
    const store = new Store(':memory:');
    const { userId } = store.createUser();
    const threadId = store.createThread(userId);
    if (scenario.history) {
        const past = store.createThread(userId);
        store.appendMessage(userId, past, 'user', 'Which managed Postgres providers should I shortlist for a small application?', historicalTime);
        store.appendMessage(userId, past, 'assistant', 'We shortlisted Neon, Supabase, and Render. We did not verify their prices or save any historical pricing evidence.', historicalTime);
    }
    const budget = new Budget(new AbortController().signal, cfg.turnTimeoutMs);
    const started = performance.now();
    try {
        const result = await runAgent({ userId, threadId, messageId: 'not-history', text: scenario.text, timezone: cfg.timezone, now }, { store, budget, model: new OpenAIModel(cfg, budget), web: new TavilySearch(cfg.tavilyKey, budget) });
        reports.push({ ...scenario, elapsed_ms: Math.round(performance.now() - started), requests: budget.counts, result, human_grade: null });
        console.log(`Recorded ${scenario.id}: ${Math.round(performance.now() - started)} ms; ${budget.counts.model} model / ${budget.counts.search} search calls`);
    }
    catch (error) {
        reports.push({ ...scenario, error: error instanceof Error ? error.message : 'unknown', elapsed_ms: Math.round(performance.now() - started), human_grade: null });
    }
    finally {
        budget.close();
        store.close();
    }
}
mkdirSync('evals/results', { recursive: true });
const path = `evals/results/live-${new Date().toISOString().replaceAll(':', '-')}.json`;
writeFileSync(path, JSON.stringify({ recorded_at: now.toISOString(), models: { planner: cfg.plannerModel, answer: cfg.answerModel, verify: cfg.verifyModel }, note: 'Real-provider outputs; ungraded until independently reviewed.', reports }, null, 2));
console.log(`\nSaved ${path}. Read evals/RUBRIC.md and grade the actual claims against primary sources.`);
