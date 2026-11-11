import { isIP } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import type { WebSearch, Source, SearchQuery } from '../contracts.ts';
import type { Budget } from '../agent/budget.ts';
import { postJson } from './http.ts';
import type { Fetch } from './http.ts';
export function safeUrl(raw: string): string | null {
    try {
        const u = new URL(raw);
        if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password)
            return null;
        const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
        if (!host.includes('.') && !isIP(host))
            return null;
        if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal'))
            return null;
        if (isIP(host) === 4) {
            const [a, b] = host.split('.').map(Number);
            if (a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b! >= 16 && b! <= 31 || a === 192 && b === 168 || a! >= 224 || a === 100 && b! >= 64 && b! <= 127)
                return null;
        }
        // Public evidence links need not use IP literals. Deny IPv6 literals, including mapped IPv4.
        if (isIP(host) === 6)
            return null;
        u.hash = '';
        for (const key of [...u.searchParams.keys()])
            if (key.startsWith('utm_') || ['gclid', 'fbclid'].includes(key))
                u.searchParams.delete(key);
        return u.toString();
    }
    catch {
        return null;
    }
}
export function assertPublicQuery(query: string): void {
    if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b|\b(?:sk|tvly)-[A-Za-z0-9_-]{10,}/.test(query))
        throw new Error('Search query contains a private identifier or credential');
}
export function queryKey(q: SearchQuery): string { return JSON.stringify([q.query.toLowerCase().trim().replace(/\s+/g, ' '), q.purpose, [...q.domains].sort(), q.since]); }
export class TavilySearch implements WebSearch {
    private key: string;
    private budget: Budget;
    private clock: () => Date;
    private fetcher: Fetch;
    constructor(key: string, budget: Budget, clock: () => Date = () => new Date(), fetcher: Fetch = fetch) { this.key = key; this.budget = budget; this.clock = clock; this.fetcher = fetcher; }
    async search(q: SearchQuery, signal: AbortSignal): Promise<Source[]> {
        assertPublicQuery(q.query);
        const domains = q.domains.filter(d => /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(d));
        const body: Record<string, unknown> = { query: q.query, search_depth: 'advanced', max_results: 4, include_answer: false, include_raw_content: 'markdown', include_published_date: true, topic: 'general', include_domains: domains };
        // Never date-filter the current-pricing query: most pricing pages have no publication date.
        if (q.purpose === 'changes' && q.since && /^\d{4}-\d{2}-\d{2}$/.test(q.since))
            body.start_date = q.since;
        if (q.purpose === 'current' || q.purpose === 'changes')
            body.max_age_hours = 1;
        const result = await postJson('https://api.tavily.com/search', body, this.key, 'Tavily', signal, this.budget, 'search', this.fetcher) as {
            results?: Array<{
                url?: string;
                title?: string;
                content?: string;
                raw_content?: string | null;
                published_date?: string | null;
            }>;
        };
        if (!Array.isArray(result.results))
            throw new Error('Search provider returned an invalid result');
        const observedAt = this.clock().toISOString();
        const seen = new Set<string>();
        const sources: Source[] = [];
        for (const r of result.results) {
            const url = safeUrl(r.url ?? '');
            if (!url || seen.has(url))
                continue;
            seen.add(url);
            const raw = r.raw_content || r.content || '';
            if (!raw.trim())
                continue;
            // The full returned snapshot is immutable in the store; the agent separately caps prompt size.
            const content = raw.slice(0, 60000);
            sources.push({ id: `s_${randomUUID()}`, url, title: (r.title ?? url).slice(0, 400), content, content_hash: createHash('sha256').update(content).digest('hex'), observed_at: observedAt, published_at: r.published_date ?? null, query: q.query });
        }
        return sources;
    }
}
