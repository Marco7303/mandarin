import { NextRequest } from 'next/server';
import { getDatabase } from '@/lib/database';
import { authenticateShare, readShareBody, ShareBodyTooLarge, shareJSON } from '@/lib/sharing-api';
import { sharedDeckInputSchema } from '@/lib/sharing-schema';
import { getOwnedShare, publishSharedDeck } from '@/lib/sharing-store';

export async function GET(request: NextRequest) {
    const auth = await authenticateShare(request);
    if ('error' in auth) return auth.error;
    const setId = request.nextUrl.searchParams.get('setId');
    const kind = request.nextUrl.searchParams.get('kind');
    if (kind && kind !== 'set' && kind !== 'folder') return shareJSON({ error: 'Invalid sharing type.' }, 400);
    if (!setId || setId.length > 160) return shareJSON({ error: 'A valid set is required.' }, 400);
    try { return shareJSON({ share: await getOwnedShare(getDatabase(), auth.user.id, setId, ...(kind ? [kind] : [])) }); }
    catch { return shareJSON({ error: 'Could not load sharing settings. Please try again.' }, 503); }
}
export async function POST(request: NextRequest) {
    const auth = await authenticateShare(request);
    if ('error' in auth) return auth.error;
    let body: unknown;
    try { body = await readShareBody(request); }
    catch (error) {
        return error instanceof ShareBodyTooLarge
            ? shareJSON({ error: 'This share exceeds the 2 MB sharing limit.' }, 413)
            : shareJSON({ error: 'Invalid set data.' }, 400);
    }
    const parsed = sharedDeckInputSchema.safeParse(body);
    if (!parsed.success) return shareJSON({ error: parsed.error.issues[0]?.message || 'Invalid set data.' }, 400);
    try { return shareJSON(await publishSharedDeck(getDatabase(), auth.user.id, parsed.data)); }
    catch { return shareJSON({ error: 'Could not share this set. Please try again.' }, 503); }
}
