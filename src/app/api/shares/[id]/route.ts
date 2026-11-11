import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getDatabase } from '@/lib/database';
import { authenticateShare, shareJSON } from '@/lib/sharing-api';
import { deleteSharedDeck, getSharedDeck } from '@/lib/sharing-store';

type Context = { params: Promise<{ id: string }> };
const missing = () => shareJSON({ error: 'This shared set is unavailable.' }, 404);
export async function GET(_request: NextRequest, context: Context) {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) return missing();
    try {
        const deck = await getSharedDeck(getDatabase(), id);
        return deck ? shareJSON(deck) : missing();
    } catch { return shareJSON({ error: 'Could not load this set. Please try again.' }, 503); }
}
export async function DELETE(request: NextRequest, context: Context) {
    const auth = await authenticateShare(request);
    if ('error' in auth) return auth.error;
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) return missing();
    try {
        return await deleteSharedDeck(getDatabase(), auth.user.id, id) ? shareJSON({ success: true }) : missing();
    } catch { return shareJSON({ error: 'Could not stop sharing. Please try again.' }, 503); }
}
