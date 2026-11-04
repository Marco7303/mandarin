import type { PrismaClient, Prisma } from '@/generated/prisma/client';
import type { CloudSnapshot } from './cloud-schema';

export class SyncConflict extends Error {}
type SavedLibrary = { state: Prisma.JsonValue; updatedAt: Date; revision: number };

// The caller supplies a verified Stack user ID, never an owner taken from a body.
export function loadLibrary(database: PrismaClient, userId: string) {
    return database.userState.findUnique({ where: { userId }, select: { state: true, updatedAt: true, revision: true } });
}

export async function saveLibrary(database: PrismaClient, userId: string, state: CloudSnapshot, expectedRevision: number | null) {
    // Each write is one atomic compare-and-swap. A missing version may only create
    // a library; a numbered version may only update that exact existing revision.
    const rows = expectedRevision === null
        ? await database.$queryRaw<SavedLibrary[]>`
            INSERT INTO user_state (user_id, state) VALUES (${userId}, ${JSON.stringify(state)}::jsonb)
            ON CONFLICT (user_id) DO NOTHING
            RETURNING state, updated_at AS "updatedAt", revision`
        : await database.$queryRaw<SavedLibrary[]>`
            UPDATE user_state SET state = ${JSON.stringify(state)}::jsonb,
                revision = revision + 1, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ${userId} AND revision = ${expectedRevision}
            RETURNING state, updated_at AS "updatedAt", revision`;
    if (!rows[0]) throw new SyncConflict('Your cloud library changed on another device. Reload cloud cards before syncing. Your local cards are preserved.');
    return rows[0];
}
