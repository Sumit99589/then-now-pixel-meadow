export class BudgetExceeded extends Error {
    constructor(message = 'Turn budget exhausted') { super(message); this.name = 'BudgetExceeded'; }
}
export class Budget {
    counts = { model: 0, search: 0 };
    readonly signal: AbortSignal;
    readonly controller = new AbortController();
    private timer: ReturnType<typeof setTimeout>;
    readonly limits: {
        model: number;
        search: number;
    };
    constructor(parent: AbortSignal, ms = 90000, limits = { model: 5, search: 12 }) {
        this.limits = limits;
        this.signal = AbortSignal.any([parent, this.controller.signal]);
        this.timer = setTimeout(() => this.controller.abort(new BudgetExceeded('Turn time limit reached')), ms);
        this.timer.unref();
    }
    take(kind: 'model' | 'search'): void {
        this.signal.throwIfAborted();
        if (this.counts[kind] >= this.limits[kind])
            throw new BudgetExceeded(`${kind} call limit reached`);
        this.counts[kind]++;
    }
    close(): void { clearTimeout(this.timer); }
}
export async function parallelMap<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const output: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (next < items.length) {
            const index = next++;
            output[index] = await fn(items[index]!, index);
        }
    }));
    return output;
}
