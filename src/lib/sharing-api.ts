import { NextRequest, NextResponse } from 'next/server';
import { getStackServerApp } from './stack-server';
import { MAX_SHARE_BYTES } from './sharing-schema';

export const shareJSON = (value: unknown, status = 200) => NextResponse.json(value, {
    status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
});
export async function authenticateShare(request: NextRequest): Promise<{ error: NextResponse } | { user: { id: string } }> {
    if (!request.headers.get('authorization')?.match(/^Bearer (.+)$/))
        return { error: shareJSON({ error: 'Sign in to share a set.' }, 401) };
    const app = getStackServerApp();
    if (!app) return { error: shareJSON({ error: 'Sharing is not configured.' }, 503) };
    try {
        const user = await app.getUser({ tokenStore: request });
        if (!user) return { error: shareJSON({ error: 'Your session expired. Sign in again.' }, 401) };
        const expectedOwner = request.headers.get('x-mori-owner');
        if (expectedOwner && expectedOwner !== user.id)
            return { error: shareJSON({ error: 'Account changed. Sharing was cancelled.' }, 409) };
        if (!process.env.DATABASE_URL) return { error: shareJSON({ error: 'Sharing is not configured.' }, 503) };
        return { user };
    } catch {
        return { error: shareJSON({ error: 'Could not verify your session. Please try again.' }, 503) };
    }
}
export class ShareBodyTooLarge extends Error {}
export async function readShareBody(request: NextRequest) {
    if (Number(request.headers.get('content-length') || 0) > MAX_SHARE_BYTES) throw new ShareBodyTooLarge();
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Missing body');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_SHARE_BYTES) { await reader.cancel(); throw new ShareBodyTooLarge(); }
        chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
}
