/** A deliberately small JSON Schema subset, shared by model contracts and runtime validation.
 * No coercion: a malformed provider response must not silently become a valid answer. */
export type JsonSchema = {
    type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
    properties?: Record<string, JsonSchema>;
    required?: string[];
    additionalProperties?: false;
    items?: JsonSchema;
    enum?: readonly unknown[];
    anyOf?: JsonSchema[];
    minLength?: number;
    maxLength?: number;
    minItems?: number;
    maxItems?: number;
    minimum?: number;
    maximum?: number;
};
export function validate(schema: JsonSchema, value: unknown, path = '$'): void {
    if (schema.anyOf) {
        if (!schema.anyOf.some(s => { try {
            validate(s, value, path);
            return true;
        }
        catch {
            return false;
        } }))
            throw new Error(`${path}: no matching schema`);
        return;
    }
    if (schema.enum && !schema.enum.includes(value))
        throw new Error(`${path}: invalid enum`);
    if (schema.type === 'null') {
        if (value !== null)
            throw new Error(`${path}: expected null`);
        return;
    }
    if (schema.type === 'array') {
        if (!Array.isArray(value))
            throw new Error(`${path}: expected array`);
        if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity))
            throw new Error(`${path}: invalid array size`);
        value.forEach((v, i) => validate(schema.items!, v, `${path}[${i}]`));
        return;
    }
    if (schema.type === 'object') {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error(`${path}: expected object`);
        const record = value as Record<string, unknown>;
        for (const key of schema.required ?? [])
            if (!(key in record))
                throw new Error(`${path}.${key}: missing`);
        for (const [key, item] of Object.entries(record)) {
            const child = schema.properties?.[key];
            if (!child)
                throw new Error(`${path}.${key}: unknown property`);
            validate(child, item, `${path}.${key}`);
        }
        return;
    }
    if (schema.type === 'integer' || schema.type === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value)))
            throw new Error(`${path}: expected finite number`);
        if (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))
            throw new Error(`${path}: out of range`);
    }
    else if (schema.type && typeof value !== schema.type)
        throw new Error(`${path}: expected ${schema.type}`);
    if (typeof value === 'string' && (value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity)))
        throw new Error(`${path}: invalid string length`);
}
export const str = (maxLength = 2000): JsonSchema => ({ type: 'string', maxLength });
export const en = (...values: string[]): JsonSchema => ({ type: 'string', enum: values });
export const nullable = (s: JsonSchema): JsonSchema => ({ anyOf: [s, { type: 'null' }] });
export const arr = (items: JsonSchema, maxItems = 16): JsonSchema => ({ type: 'array', items, maxItems });
export const obj = (properties: Record<string, JsonSchema>): JsonSchema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export interface SearchQuery {
    query: string;
    purpose: 'current' | 'changes' | 'historical' | 'general';
    subject: string;
    domains: string[];
    since: string | null;
}
export const searchQuerySchema = obj({ query: { ...str(400), minLength: 3 }, purpose: en('current', 'changes', 'historical', 'general'), subject: str(160), domains: arr(str(180), 3), since: nullable(str(10)) });
export interface Plan {
    intent: 'chat' | 'recall' | 'research' | 'revalidate';
    memory_ids: string[];
    subjects: string[];
    required_checks: Array<{
        subject: string;
        topic: 'price' | 'feature' | 'other';
    }>;
    searches: SearchQuery[];
    clarification: string | null;
    high_stakes: boolean;
    direct_answer: Answer | null;
}
export interface Evidence {
    source_id: string;
    quote: string;
}
export interface MemoryRef {
    message_id: string;
    quote: string;
}
export interface Paragraph {
    kind: 'fact' | 'memory' | 'reasoning' | 'limitation';
    text: string;
    evidence: Evidence[];
    memories: MemoryRef[];
}
export interface Scope {
    plan: string | null;
    currency: string | null;
    billing: string | null;
    unit: string | null;
    region: string | null;
}
export type Verdict = 'changed' | 'still_supported' | 'corrected' | 'no_change_found' | 'unknown' | 'conflicting';
export interface Comparison {
    subject: string;
    topic: 'price' | 'feature' | 'other';
    verdict: Verdict;
    before: string;
    baseline: MemoryRef | null;
    baseline_evidence: Evidence[];
    now: string;
    evidence: Evidence[];
    before_scope: Scope;
    now_scope: Scope;
    event_date: string | null;
    note: string;
}
export interface Answer {
    paragraphs: Paragraph[];
    comparisons: Comparison[];
    question: string | null;
}
export interface Draft {
    answer: Answer;
    followup_searches: SearchQuery[];
}
const evidenceSchema = obj({ source_id: str(80), quote: { ...str(700), minLength: 8 } });
const memorySchema = obj({ message_id: str(80), quote: { ...str(700), minLength: 3 } });
const scopeSchema = obj({ plan: nullable(str(100)), currency: nullable(str(40)), billing: nullable(str(80)), unit: nullable(str(80)), region: nullable(str(80)) });
const paragraphSchema = obj({ kind: en('fact', 'memory', 'reasoning', 'limitation'), text: str(4000), evidence: arr(evidenceSchema, 6), memories: arr(memorySchema, 6) });
const comparisonSchema = obj({
    subject: str(160), topic: en('price', 'feature', 'other'), verdict: en('changed', 'still_supported', 'corrected', 'no_change_found', 'unknown', 'conflicting'),
    before: str(1500), baseline: nullable(memorySchema), baseline_evidence: arr(evidenceSchema, 4), now: str(1500), evidence: arr(evidenceSchema, 6),
    before_scope: scopeSchema, now_scope: scopeSchema, event_date: nullable(str(10)), note: str(1800)
});
export const answerSchema = obj({ paragraphs: arr(paragraphSchema, 16), comparisons: arr(comparisonSchema, 12), question: nullable(str(600)) });
export const planSchema = obj({ intent: en('chat', 'recall', 'research', 'revalidate'), memory_ids: arr(str(80), 24), subjects: arr(str(160), 10), required_checks: arr(obj({ subject: str(160), topic: en('price', 'feature', 'other') }), 20), searches: arr(searchQuerySchema, 10), clarification: nullable(str(600)), high_stakes: { type: 'boolean' }, direct_answer: nullable(answerSchema) });
export const draftSchema = obj({ answer: answerSchema, followup_searches: arr(searchQuerySchema, 2) });
export interface Audit {
    unsupported_paragraphs: number[];
    unsupported_comparisons: number[];
    explanation: string;
}
const indices = arr({ type: 'integer', minimum: 0, maximum: 30 }, 30);
export const auditSchema = obj({ unsupported_paragraphs: indices, unsupported_comparisons: indices, explanation: str(2000) });
export interface Source {
    id: string;
    url: string;
    title: string;
    content: string;
    content_hash: string;
    observed_at: string;
    published_at: string | null;
    query: string;
    excerpted?: boolean;
}
export interface Message {
    id: string;
    user_id: string;
    thread_id: string;
    seq: number;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
    answer: Answer | null;
}
export interface DateWindow {
    label: string;
    start: string;
    end: string;
    local_date: string;
    ambiguous: boolean;
}
export interface MemoryBundle {
    messages: Message[];
    historical_sources: Source[];
    windows: DateWindow[];
    truncated: boolean;
    total_matches: number;
}
export interface TraceEvent {
    phase: string;
    at: string;
    detail: Record<string, unknown>;
}
export interface Usage {
    model: string;
    input_tokens: number;
    output_tokens: number;
    elapsed_ms: number;
}
export interface TurnResult {
    answer: Answer;
    sources: Source[];
    historical_sources: Source[];
    memories: Message[];
    trace: TraceEvent[];
    usage: Usage[];
    warnings: string[];
}
export interface Model {
    complete<T>(args: {
        stage: 'plan' | 'answer' | 'audit';
        instructions: string;
        data: unknown;
        schema: JsonSchema;
        signal: AbortSignal;
    }): Promise<{
        value: T;
        usage: Usage;
    }>;
}
export interface WebSearch {
    search(query: SearchQuery, signal: AbortSignal): Promise<Source[]>;
}
export const emptyScope = (): Scope => ({ plan: null, currency: null, billing: null, unit: null, region: null });
export const limitation = (text: string, question: string | null = null): Answer => ({ paragraphs: [{ kind: 'limitation', text, evidence: [], memories: [] }], comparisons: [], question });
