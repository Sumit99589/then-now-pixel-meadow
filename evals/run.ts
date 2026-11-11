/** Offline regression assertions, NOT a claim about live model answer quality. */
import assert from 'node:assert/strict';
import { Store } from '../src/memory/store.ts';
import { Budget } from '../src/agent/budget.ts';
import { runAgent } from '../src/agent/agent.ts';
import { DEMO_NOW, DemoModel, DemoSearch, seedDemo } from '../src/demo.ts';
import { groundingErrors } from '../src/agent/grounding.ts';
import { memoryFixture, now } from '../tests/helpers.ts';
const cases = [
    { name: 'five-product temporal revalidation', question: 'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any pricing changed since?', checks: 5, searches: 5 },
    { name: 'multi-intent coverage: price AND releases', question: 'On Monday we shortlisted 5 CRM tools. Has any pricing changed or anything big shipped?', checks: 10, searches: 5 },
    { name: 'date-only historical recall', question: 'What did I ask you on 3 November?', checks: 0, searches: 0 },
    { name: 'relative-date ambiguity with relevant topic', question: 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?', checks: 1, searches: 1 }
];
let passed = 0;
for (const scenario of cases) {
    const store = new Store(':memory:');
    const { userId } = store.createUser();
    seedDemo(store, userId);
    const threadId = store.createThread(userId);
    const budget = new Budget(new AbortController().signal, 5000);
    try {
        const result = await runAgent({ userId, threadId, messageId: 'not-a-baseline', text: scenario.question, timezone: 'Asia/Kolkata', now: DEMO_NOW }, { store, budget, model: new DemoModel(budget), web: new DemoSearch(budget) });
        assert.equal(result.answer.comparisons.length, scenario.checks);
        assert.equal(budget.counts.search, scenario.searches);
        assert(!result.warnings.some(w => w.includes('failed structural')));
        console.log(`PASS  ${scenario.name}`);
        passed++;
    }
    finally {
        budget.close();
        store.close();
    }
}
for (const scenario of ['missing historical evidence', 'different billing cadence', 'invented citation', 'omitted feature check']) {
    const f = memoryFixture();
    if (scenario === 'missing historical evidence') {
        f.comparison.baseline_evidence = [];
        f.comparison.event_date = null;
    }
    if (scenario === 'different billing cadence')
        f.comparison.now_scope.billing = 'annual';
    if (scenario === 'invented citation')
        f.comparison.evidence[0]!.source_id = 'made-up';
    if (scenario === 'omitted feature check')
        f.plan.required_checks.push({ subject: 'Aster CRM', topic: 'feature' });
    assert(groundingErrors(f.answer, f.memory, [f.source], f.plan, now).length);
    console.log(`PASS  rejects ${scenario}`);
    passed++;
}
console.log(`\n${passed}/${cases.length + 4} offline regression cases passed. Synthetic providers; no live quality or latency score is implied.`);
