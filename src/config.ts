import { resolve } from 'node:path';
export interface Config {
    host: string;
    port: number;
    databasePath: string;
    timezone: string;
    openaiKey: string;
    tavilyKey: string;
    plannerModel: string;
    answerModel: string;
    verifyModel: string;
    appPassword: string;
    publicOrigin: string;
    turnTimeoutMs: number;
    demo: boolean;
}
export function config(env: NodeJS.ProcessEnv = process.env): Config {
    const demo = env.DEMO_MODE === 'true';
    const c: Config = {
        host: env.HOST ?? '127.0.0.1', port: Number(env.PORT ?? 3000), databasePath: resolve(env.DATABASE_PATH ?? (demo ? './data/demo.sqlite' : './data/agent.sqlite')),
        timezone: env.DEFAULT_TIMEZONE ?? 'Asia/Kolkata', openaiKey: env.OPENAI_API_KEY ?? '', tavilyKey: env.TAVILY_API_KEY ?? '',
        plannerModel: env.PLANNER_MODEL ?? 'gpt-5.4-mini-2026-03-17', answerModel: env.ANSWER_MODEL ?? 'gpt-5.4-2026-03-05', verifyModel: env.VERIFY_MODEL ?? 'gpt-5.4-mini-2026-03-17',
        appPassword: env.APP_PASSWORD ?? '', publicOrigin: env.PUBLIC_ORIGIN ?? '', turnTimeoutMs: Number(env.TURN_TIMEOUT_MS ?? 90000), demo
    };
    if (!Number.isInteger(c.port) || c.port < 0 || c.port > 65535)
        throw new Error('Invalid PORT');
    if (!Number.isFinite(c.turnTimeoutMs) || c.turnTimeoutMs < 1000 || c.turnTimeoutMs > 180000)
        throw new Error('TURN_TIMEOUT_MS must be 1000..180000');
    new Intl.DateTimeFormat('en', { timeZone: c.timezone }).format();
    if (!['127.0.0.1', 'localhost', '::1'].includes(c.host) && !c.appPassword)
        throw new Error('APP_PASSWORD is required for a non-local bind');
    if (c.publicOrigin && !['http:', 'https:'].includes(new URL(c.publicOrigin).protocol))
        throw new Error('Invalid PUBLIC_ORIGIN');
    return c;
}
