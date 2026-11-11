import { NextRequest } from 'next/server';
import { getDatabase } from '@/lib/database';
import { authenticateShare, shareJSON } from '@/lib/sharing-api';

export async function GET(request: NextRequest) {
    const auth = await authenticateShare(request);
    if ('error' in auth) return auth.error;
    try {
        const profile = await getDatabase().creatorProfile.findUnique({ where: { userId: auth.user.id }, select: { displayName: true } });
        return shareJSON({ displayName: profile?.displayName || '' });
    } catch { return shareJSON({ error: 'Could not load your public name. Please try again.' }, 503); }
}
