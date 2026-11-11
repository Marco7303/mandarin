import { NextRequest } from 'next/server';
import { getDatabase } from '@/lib/database';
import { shareJSON } from '@/lib/sharing-api';
import { communityQuerySchema } from '@/lib/community-schema';
import { findPublicSets } from '@/lib/community-store';

export async function GET(request: NextRequest) {
    const parsed = communityQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return shareJSON({ error: 'Use a search of up to 100 characters and a valid page.' }, 400);
    try { return shareJSON(await findPublicSets(getDatabase(), parsed.data)); }
    catch { return shareJSON({ error: 'Could not load public sets. Please try again.' }, 503); }
}
