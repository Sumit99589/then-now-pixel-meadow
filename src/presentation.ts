import type { Source, TurnResult } from './contracts.ts';
/** Full snapshots are stored once in sources. Replays/history keep a compact display payload.
 * content_hash continues to identify the full snapshot, available through an owner-scoped endpoint. */
export function compactResult(result: TurnResult): TurnResult {
    const compact = (source: Source): Source => ({ ...source, content: source.content.slice(0, 4000), excerpted: source.excerpted || source.content.length > 4000 });
    return { ...result, sources: result.sources.map(compact), historical_sources: result.historical_sources.map(compact), memories: result.memories.map(m => ({ ...m, answer: null })) };
}
