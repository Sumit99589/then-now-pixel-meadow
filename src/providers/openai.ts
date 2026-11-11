import type { Config } from '../config.ts';
import type { Model, Usage } from '../contracts.ts';
import { validate } from '../contracts.ts';
import type { Budget } from '../agent/budget.ts';
import { postJson } from './http.ts';
import type { Fetch } from './http.ts';
export class OpenAIModel implements Model {
    private cfg: Config;
    private budget: Budget;
    private fetcher: Fetch;
    constructor(cfg: Config, budget: Budget, fetcher: Fetch = fetch) { this.cfg = cfg; this.budget = budget; this.fetcher = fetcher; }
    async complete<T>(args: Parameters<Model['complete']>[0]): Promise<{
        value: T;
        usage: Usage;
    }> {
        const model = args.stage === 'plan' ? this.cfg.plannerModel : args.stage === 'audit' ? this.cfg.verifyModel : this.cfg.answerModel;
        const started = performance.now();
        const result = await postJson('https://api.openai.com/v1/responses', {
            model, store: false, instructions: args.instructions,
            input: [{ role: 'user', content: [{ type: 'input_text', text: JSON.stringify(args.data) }] }],
            text: { format: { type: 'json_schema', name: `agent_${args.stage}`, strict: true, schema: args.schema } },
            max_output_tokens: args.stage === 'answer' ? 6500 : args.stage === 'plan' ? 3500 : 2200
        }, this.cfg.openaiKey, 'OpenAI', args.signal, this.budget, 'model', this.fetcher) as {
            status?: string;
            output?: Array<{
                type: string;
                content?: Array<{
                    type: string;
                    text?: string;
                    refusal?: string;
                }>;
            }>;
            usage?: {
                input_tokens?: number;
                output_tokens?: number;
            };
        };
        if (result.status !== 'completed')
            throw new Error('The model did not finish a complete structured response');
        const content = result.output?.flatMap(o => o.content ?? []) ?? [];
        if (content.some(c => c.type === 'refusal'))
            throw new Error('The model declined this request');
        const text = content.filter(c => c.type === 'output_text').map(c => c.text ?? '').join('');
        let value: unknown;
        try {
            value = JSON.parse(text);
        }
        catch {
            throw new Error('The model returned invalid JSON');
        }
        validate(args.schema, value);
        return { value: value as T, usage: { model, input_tokens: result.usage?.input_tokens ?? 0, output_tokens: result.usage?.output_tokens ?? 0, elapsed_ms: Math.round(performance.now() - started) } };
    }
}
