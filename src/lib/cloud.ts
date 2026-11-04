'use client';
import { StackClientApp } from '@stackframe/stack';

let client: StackClientApp<true> | null | undefined;
const revisions = new Map<string, number | null>();
type Session = { user: { id: string; email: string } };
type AuthListener = (event: 'SIGNED_IN' | 'SIGNED_OUT', session: Session | null) => void;
const listeners = new Set<AuthListener>();

export function getCloudRevision(userId: string) { return revisions.get(userId) ?? null; }
export function getClient() {
    if (client !== undefined) return client;
    const projectId = process.env.NEXT_PUBLIC_HEXCLAVE_PROJECT_ID || process.env.NEXT_PUBLIC_STACK_PROJECT_ID;
    const publishableClientKey = process.env.NEXT_PUBLIC_HEXCLAVE_PUBLISHABLE_CLIENT_KEY || process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY || undefined;
    try {
        client = projectId ? new StackClientApp({
            projectId, publishableClientKey, tokenStore: 'cookie', redirectMethod: 'none',
            devTool: false, noAutomaticPrefetch: true,
            urls: { default: { type: 'hosted' }, home: '/', afterSignIn: '/', afterSignUp: '/', afterSignOut: '/' },
        }) : null;
    } catch {
        // A malformed project configuration must not prevent local studying.
        client = null;
    }
    return client;
}
function requireClient() {
    const value = getClient();
    if (!value) throw new Error('Cloud sync is not configured. Your cards are saved on this device.');
    return value;
}
export async function getSession(): Promise<Session | null> {
    const user = await getClient()?.getUser();
    return user ? { user: { id: user.id, email: user.primaryEmail || '' } } : null;
}
export function onAuthStateChange(listener: AuthListener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
async function notifyAuthChange() {
    const session = await getSession();
    for (const listener of listeners) listener(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
}
async function request(method: 'GET' | 'POST', state?: unknown, options?: { userId?: string; expectedRevision?: number | null }) {
    const app = requireClient();
    const session = await getSession();
    if (!session) throw new Error('Sign in to sync your cards.');
    if (options?.userId && session.user.id !== options.userId) throw new Error('Account changed. Sync was cancelled.');
    const owner = session.user.id;
    const authorization = await app.getAuthorizationHeader();
    if (!authorization) throw new Error('Sign in to sync your cards.');
    const response = await fetch('/api/sync', {
        method,
        headers: { Authorization: authorization, 'X-Mori-Owner': owner, 'Content-Type': 'application/json' },
        ...(method === 'POST' ? { body: JSON.stringify({ state, expectedRevision: options && 'expectedRevision' in options ? options.expectedRevision : revisions.get(owner) ?? null }) } : {}),
        cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Sync failed. Your cards are safe on this device.');
    revisions.set(owner, data.revision ?? null);
    return data;
}
export async function loadCloud(userId?: string): Promise<{ state: unknown; updatedAt: string; revision: number } | null> {
    const data = await request('GET', undefined, { userId });
    return data.state ? data : null;
}
export async function saveCloud(state: unknown, options?: { userId?: string; expectedRevision?: number | null }): Promise<string> {
    const data = await request('POST', state, options);
    return data.updatedAt;
}
export async function signIn(email: string, password: string) {
    const result = await requireClient().signInWithCredential({ email, password, noRedirect: true });
    if (result.status === 'error') throw new Error(result.error.humanReadableMessage || result.error.message);
    revisions.clear();
    await notifyAuthChange();
}
export async function signUp(email: string, password: string) {
    const result = await requireClient().signUpWithCredential({ email, password, noRedirect: true });
    if (result.status === 'error') throw new Error(result.error.humanReadableMessage || result.error.message);
    revisions.clear();
    await notifyAuthChange();
    // Restricted accounts must verify their email before accessing cloud data.
    return !(await getSession());
}
export async function signOut() {
    await requireClient().signOut();
    revisions.clear();
    for (const listener of listeners) listener('SIGNED_OUT', null);
}
