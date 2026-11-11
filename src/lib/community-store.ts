import type { PrismaClient, Prisma } from '@/generated/prisma/client';
import type { z } from 'zod';
import type { reportSchema } from './community-schema';

// Metadata only: never send vocabulary, account IDs, or private set IDs in search results.
const summaryFields = { id: true, name: true, description: true, creatorName: true, wordCount: true, updatedAt: true, kind: true, setCount: true } as const;
export async function findPublicSets(database: PrismaClient, query: { q: string; cursor?: string; kind?: 'set' | 'folder' }) {
    const where: Prisma.SharedDeckWhereInput = { isPublic: true, suppressed: false };
    if (query.kind) where.kind = query.kind;
    if (query.q) {
        // Treat SQL LIKE wildcards as literal search text.
        const contains = query.q.replace(/[\\%_]/g, '\\$&');
        where.OR = ['name', 'description', 'creatorName'].map(field => ({ [field]: { contains, mode: 'insensitive' } }));
    }
    if (query.cursor) {
        const [date, id] = query.cursor.split('|');
        where.AND = [{ OR: [{ updatedAt: { lt: new Date(date) } }, { updatedAt: new Date(date), id: { lt: id } }] }];
    }
    const rows = await database.sharedDeck.findMany({ where, select: summaryFields,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 21 });
    const sets = rows.slice(0, 20), last = sets.at(-1);
    return { sets, nextCursor: rows.length > 20 && last ? `${last.updatedAt.toISOString()}|${last.id}` : null };
}
export async function reportPublicSet(database: PrismaClient, reporterId: string, deckId: string, report: z.infer<typeof reportSchema>) {
    // Insert from the public row atomically; revocation/moderation cannot leave an orphan report.
    return database.$executeRaw`
        INSERT INTO deck_report (deck_id, reporter_id, reason, details)
        SELECT id, ${reporterId}, ${report.reason}, ${report.details} FROM shared_deck
        WHERE id = ${deckId} AND is_public = true AND suppressed = false
        ON CONFLICT (deck_id, reporter_id) DO NOTHING`;
}
