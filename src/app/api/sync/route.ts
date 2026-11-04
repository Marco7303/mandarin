import { getStackServerApp } from '@/lib/stack-server';
import { getDatabase } from '@/lib/database';
import { loadLibrary, saveLibrary, SyncConflict } from '@/lib/library-store';
import { NextRequest, NextResponse } from 'next/server';
import { snapshotSchema } from '@/lib/cloud-schema';
const MAX_BYTES = 8 * 1024 * 1024;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
async function authenticate(request: NextRequest): Promise<{ error: NextResponse } | { user: { id: string } }> {
    const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!token)
        return { error: json({ error: 'Sign in to sync your cards.' }, 401) };
    const app = getStackServerApp();
    if (!app) return { error: json({ error: 'Cloud sync is not configured.' }, 503) };
    try {
        // Stack validates the request token with its server SDK. Never resolve a
        // user by an untrusted userId, or use a decoded JWT without verification.
        const user = await app.getUser({ tokenStore: request });
        if (!user) return { error: json({ error: 'Your session expired. Sign in again.' }, 401) };
        const expectedOwner = request.headers.get('x-mori-owner');
        if (expectedOwner && expectedOwner !== user.id)
            return { error: json({ error: 'Account changed. Sync was cancelled.' }, 409) };
        if (!process.env.DATABASE_URL)
            return { error: json({ error: 'Cloud database is not configured.' }, 503) };
        return { user };
    } catch {
        return { error: json({ error: 'Could not verify your session. Please try again.' }, 503) };
    }
}
export async function GET(request: NextRequest) {
    const auth = await authenticate(request);
    if ('error' in auth) return auth.error;
    try {
        const data = await loadLibrary(getDatabase(), auth.user.id);
        return json(data || { state: null, revision: null });
    } catch {
        return json({ error: 'Could not load your cloud cards.' }, 503);
    }
}
export async function POST(request: NextRequest) {
    const auth = await authenticate(request);
    if ('error' in auth)
        return auth.error;
    const declaredSize = Number(request.headers.get('content-length') || 0);
    if (declaredSize > MAX_BYTES)
        return json({ error: 'Your library exceeds the 8 MB sync limit.' }, 413);
    try {
        const reader = request.body?.getReader();
        if (!reader)
            return json({ error: 'Library data is missing.' }, 400);
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.byteLength;
            if (size > MAX_BYTES) {
                await reader.cancel();
                return json({ error: 'Your library exceeds the 8 MB sync limit.' }, 413);
            }
            chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        const body = JSON.parse(new TextDecoder().decode(bytes));
        if (!body || typeof body !== 'object' || Array.isArray(body))
            return json({ error: 'Invalid library data.' }, 400);
        const parsed = snapshotSchema.safeParse(body.state);
        if (!parsed.success)
            return json({ error: parsed.error.issues[0]?.message || 'Invalid library.' }, 400);
        if (body.expectedRevision !== null && (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1 || body.expectedRevision >= 2147483647))
            return json({ error: 'Invalid sync version.' }, 400);
        try {
            const data = await saveLibrary(getDatabase(), auth.user.id, parsed.data, body.expectedRevision);
            return json({ updatedAt: data.updatedAt, revision: data.revision });
        } catch (error) {
            if (error instanceof SyncConflict) return json({ error: error.message }, 409);
            return json({ error: 'Could not sync. Your cards remain saved on this device.' }, 503);
        }
    }
    catch {
        return json({ error: 'Invalid library data.' }, 400);
    }
}
