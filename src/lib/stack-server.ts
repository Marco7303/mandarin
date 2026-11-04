import 'server-only';
import { StackServerApp } from '@stackframe/stack';

let app: StackServerApp | undefined;
export function getStackServerApp() {
    const projectId = process.env.NEXT_PUBLIC_HEXCLAVE_PROJECT_ID || process.env.NEXT_PUBLIC_STACK_PROJECT_ID;
    const publishableClientKey = process.env.NEXT_PUBLIC_HEXCLAVE_PUBLISHABLE_CLIENT_KEY || process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY || undefined;
    const secretServerKey = process.env.HEXCLAVE_SECRET_SERVER_KEY || process.env.STACK_SECRET_SERVER_KEY;
    if (!projectId || !secretServerKey) return null;
    try {
        app ??= new StackServerApp({
            projectId, publishableClientKey, secretServerKey, tokenStore: null,
            noAutomaticPrefetch: true,
        });
        return app;
    } catch {
        return null;
    }
}
