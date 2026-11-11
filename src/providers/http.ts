import { setTimeout as sleep } from 'node:timers/promises';
import type { Budget } from '../agent/budget.ts';
export class ProviderError extends Error {
    readonly provider: string;
    readonly status: number;
    readonly retryable: boolean;
    constructor(provider: string, status: number, retryable: boolean) { super(`${provider} request failed (${status})`); this.name = 'ProviderError'; this.provider = provider; this.status = status; this.retryable = retryable; }
}
export type Fetch = typeof globalThis.fetch;
/** Retry only transient transport/status failures. Never log provider bodies or credentials. */
export async function postJson(url: string, body: unknown, apiKey: string, provider: string, signal: AbortSignal, budget: Budget, kind: 'model' | 'search', fetcher: Fetch = fetch): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
        budget.take(kind);
        const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(kind === 'model' ? 35000 : 18000)]);
        let response: Response;
        try {
            response = await fetcher(url, { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: requestSignal });
        }
        catch (error) {
            signal.throwIfAborted();
            if (attempt === 1)
                throw new ProviderError(provider, 0, true);
            await sleep(200 + Math.random() * 200, undefined, { signal });
            continue;
        }
        if (!response.ok) {
            const retryable = [429, 500, 502, 503, 504].includes(response.status);
            await response.body?.cancel();
            if (!retryable || attempt === 1)
                throw new ProviderError(provider, response.status, retryable);
            const retryAfter = Number(response.headers.get('retry-after'));
            await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 2000) : 300 + Math.random() * 200, undefined, { signal });
            continue;
        }
        // Provider responses can contain long raw pages. Bound bytes before parsing.
        const reader = response.body?.getReader();
        if (!reader)
            throw new ProviderError(provider, 0, false);
        let size = 0;
        const chunks: Uint8Array[] = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.byteLength;
            if (size > 3000000) {
                await reader.cancel();
                throw new ProviderError(provider, 413, false);
            }
            chunks.push(value);
        }
        try {
            return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
        }
        catch {
            throw new ProviderError(provider, 422, false);
        }
    }
    throw new Error('Unreachable');
}
