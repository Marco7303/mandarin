import { spawn } from 'node:child_process';

function run(args, env = process.env) {
    return new Promise((resolve, reject) => {
        const child = spawn('pnpm', args, { stdio: 'inherit', env });
        child.on('error', reject);
        child.on('exit', code => resolve(code ?? 1));
    });
}

const fixtureEnvironment = {
    ...process.env,
    MORI_TEST_AUTH: '1',
    NEXT_PUBLIC_HEXCLAVE_PROJECT_ID: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    NEXT_PUBLIC_HEXCLAVE_PUBLISHABLE_CLIENT_KEY: 'fixture-public-key',
    NEXT_PUBLIC_STACK_PROJECT_ID: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY: 'fixture-public-key',
};
let result = 1;
try {
    result = await run(['test:e2e'], fixtureEnvironment);
} finally {
    // Public auth keys are compiled into Next.js. Always restore a build using
    // the user's original environment, including when a browser test fails.
    const restored = await run(['build']);
    if (restored !== 0) result = restored;
}
process.exitCode = result;
