'use client';
import { getClient, getSession } from './cloud';
import { sharedDeckSchema } from './sharing-schema';
import type { Entry } from './core';

export async function sharingRequest(method: 'GET' | 'POST' | 'DELETE', owner: string, path = '', body?: { setId: string; name: string; entries: Entry[] }) {
    if (!navigator.onLine) throw new Error('Connect to the internet to manage sharing.');
    const client = getClient();
    const session = await getSession();
    if (!client || !session || session.user.id !== owner) throw new Error('Sign in again to manage sharing.');
    const authorization = await client.getAuthorizationHeader();
    if (!authorization) throw new Error('Sign in again to manage sharing.');
    const response = await fetch(`/api/shares${path}`, {
        method, cache: 'no-store',
        headers: { Authorization: authorization, 'X-Mori-Owner': owner, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if ((await getSession())?.user.id !== owner) throw new Error('Account changed. Reopen sharing.');
    if (!response.ok) throw new Error(data.error || 'Could not update sharing. Please try again.');
    if (method === 'DELETE') return null;
    const snapshot = method === 'GET' ? data.share : data;
    if (snapshot === null) return null;
    const parsed = sharedDeckSchema.safeParse(snapshot);
    if (!parsed.success) throw new Error('Could not read sharing settings. Please try again.');
    return parsed.data;
}
