import { NextRequest } from 'next/server';
import { getDatabase } from '@/lib/database';
import { authenticateShare, readShareBody, ShareBodyTooLarge, shareJSON } from '@/lib/sharing-api';
import { creatorNameSchema } from '@/lib/sharing-schema';
import { savePublicName } from '@/lib/profile-store';
import { z } from 'zod';

export async function GET(request: NextRequest) {
    const auth = await authenticateShare(request);
    if ('error' in auth) return auth.error;
    try {
        const profile = await getDatabase().creatorProfile.findUnique({ where: { userId: auth.user.id }, select: { displayName: true } });
        return shareJSON({ displayName: profile?.displayName || '' });
    } catch { return shareJSON({ error: 'Could not load your public name. Please try again.' }, 503); }
}

export async function POST(request: NextRequest) {
    const auth = await authenticateShare(request);
    if ('error' in auth) return auth.error;
    let body: unknown;
    try { body = await readShareBody(request, 4096); }
    catch (error) { return shareJSON({ error: 'Invalid public name.' }, error instanceof ShareBodyTooLarge ? 413 : 400); }
    const parsed = z.object({ displayName: creatorNameSchema }).safeParse(body);
    if (!parsed.success) return shareJSON({ error: parsed.error.issues[0]?.message || 'Choose a public name (2–50 characters).' }, 400);
    try { return shareJSON(await savePublicName(getDatabase(), auth.user.id, parsed.data.displayName)); }
    catch { return shareJSON({ error: 'Could not save your public name. Please try again.' }, 503); }
}
