import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { snapshotSchema } from '@/lib/cloud-schema';
const MAX_BYTES = 8 * 1024 * 1024;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
async function authenticate(request: NextRequest) {
    const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!token)
        return { error: json({ error: 'Sign in to sync your cards.' }, 401) };
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key)
        return { error: json({ error: 'Cloud sync is not configured.' }, 503) };
    const client = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user)
        return { error: json({ error: 'Your session expired. Sign in again.' }, 401) };
    return { client, user };
}
export async function GET(request: NextRequest) {
    const auth = await authenticate(request);
    if ('error' in auth)
        return auth.error;
    const { data, error } = await auth.client.from('user_state').select('state, updated_at, revision').eq('user_id', auth.user.id).maybeSingle();
    if (error)
        return json({ error: 'Could not load your cloud cards.' }, 500);
    return json(data ? { state: data.state, updatedAt: data.updated_at, revision: data.revision } : { state: null, revision: null });
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
        const parsed = snapshotSchema.safeParse(body.state);
        if (!parsed.success)
            return json({ error: parsed.error.issues[0]?.message || 'Invalid library.' }, 400);
        if (body.expectedRevision !== null && (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1))
            return json({ error: 'Invalid sync version.' }, 400);
        const { data, error } = await auth.client.rpc('save_user_state', { new_state: parsed.data, expected_revision: body.expectedRevision ?? null });
        if (error?.message.includes('sync_conflict'))
            return json({ error: 'Your cloud library changed on another device. Reload cloud cards before syncing. Your local cards are preserved.' }, 409);
        if (error)
            return json({ error: 'Could not sync. Your cards remain saved on this device.' }, 500);
        return json({ updatedAt: data.updated_at, revision: data.revision });
    }
    catch {
        return json({ error: 'Invalid library data.' }, 400);
    }
}
