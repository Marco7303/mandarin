import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getDatabase } from '@/lib/database';
import { authenticateShare, readShareBody, shareJSON, ShareBodyTooLarge } from '@/lib/sharing-api';
import { reportSchema } from '@/lib/community-schema';
import { reportPublicSet } from '@/lib/community-store';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await authenticateShare(request);
    if ('error' in auth) return auth.error;
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return shareJSON({ error: 'Invalid set.' }, 400);
    let body: unknown;
    try { body = await readShareBody(request, 4096); }
    catch (error) { return shareJSON({ error: 'Invalid report.' }, error instanceof ShareBodyTooLarge ? 413 : 400); }
    const parsed = reportSchema.safeParse(body);
    if (!parsed.success) return shareJSON({ error: 'Choose a reason and use up to 500 characters.' }, 400);
    try {
        await reportPublicSet(getDatabase(), auth.user.id, id, parsed.data);
        // Idempotent, including sets that have since been unpublished.
        return shareJSON({ success: true });
    } catch { return shareJSON({ error: 'Could not send your report. Please try again.' }, 503); }
}
