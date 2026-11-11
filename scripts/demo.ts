import { spawn } from 'node:child_process';
const args = process.features?.typescript ? ['--experimental-strip-types', 'src/server.ts'] : ['--import=tsx', 'src/server.ts'];
const child = spawn(process.execPath, args, { stdio: 'inherit', env: { ...process.env, DEMO_MODE: 'true', DATABASE_PATH: process.env.DATABASE_PATH ?? './data/demo.sqlite' } });
for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 0));
