'use client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
let client: SupabaseClient | null | undefined;
const revisions = new Map<string, number | null>();
export function getCloudRevision(userId: string) { return revisions.get(userId) ?? null; }
export function getClient(): SupabaseClient | null {
    if (client !== undefined)
        return client;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    client = url && key ? createClient(url, key) : null;
    return client;
}
function requireClient() {
    const value = getClient();
    if (!value)
        throw new Error('Cloud sync is not configured. Your cards are saved on this device.');
    return value;
}
async function request(method: 'GET' | 'POST', state?: unknown, options?: {
    userId?: string;
    expectedRevision?: number | null;
}) {
    const supabase = requireClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session)
        throw new Error('Sign in to sync your cards.');
    if (options?.userId && session.user.id !== options.userId)
        throw new Error('Account changed. Sync was cancelled.');
    const owner = session.user.id;
    const response = await fetch('/api/sync', {
        method,
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        ...(method === 'POST' ? { body: JSON.stringify({ state, expectedRevision: options && 'expectedRevision' in options ? options.expectedRevision : revisions.get(owner) ?? null }) } : {}),
        cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok)
        throw new Error(data.error || 'Sync failed. Your cards are safe on this device.');
    revisions.set(owner, data.revision ?? null);
    return data;
}
export async function loadCloud(userId?: string): Promise<{
    state: unknown;
    updatedAt: string;
    revision: number;
} | null> {
    const data = await request('GET', undefined, { userId });
    return data.state ? data : null;
}
export async function saveCloud(state: unknown, options?: {
    userId?: string;
    expectedRevision?: number | null;
}): Promise<string> {
    const data = await request('POST', state, options);
    return data.updatedAt;
}
export async function signIn(email: string, password: string) {
    revisions.clear();
    const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
    if (error)
        throw error;
    return data;
}
export async function signUp(email: string, password: string) {
    const { data, error } = await requireClient().auth.signUp({ email, password });
    if (error)
        throw error;
    return data;
}
export async function signOut() {
    const { error } = await requireClient().auth.signOut();
    revisions.clear();
    if (error)
        throw error;
}
