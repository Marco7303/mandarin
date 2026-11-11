import { randomUUID } from 'node:crypto';
import type { PrismaClient, Prisma } from '@/generated/prisma/client';
import type { SharedDeckInput } from './sharing-schema';
import { writePublicName } from './profile-store';

const publicFields = { id: true, name: true, entries: true, updatedAt: true, isPublic: true, description: true, creatorName: true, suppressed: true, kind: true, sets: true } as const;
export function getSharedDeck(database: PrismaClient, id: string) {
    return database.sharedDeck.findFirst({ where: { id, suppressed: false }, select: publicFields });
}
export function getOwnedShare(database: PrismaClient, ownerId: string, setId: string, kind = 'set') {
    return database.sharedDeck.findUnique({ where: { ownerId_setId_kind: { ownerId, setId, kind } }, select: publicFields });
}
export function publishSharedDeck(database: PrismaClient, ownerId: string, deck: SharedDeckInput) {
    const kind = deck.kind || 'set';
    const snapshot = { name: deck.name, entries: deck.entries as Prisma.InputJsonValue, wordCount: deck.entries.length,
        sets: (deck.sets || []) as Prisma.InputJsonValue, setCount: kind === 'folder' ? deck.sets!.length : 1,
        ...(deck.isPublic !== undefined ? { isPublic: deck.isPublic } : {}),
        ...(deck.description !== undefined ? { description: deck.description } : {}),
        ...(deck.creatorName ? { creatorName: deck.creatorName } : {}),
    };
    return database.$transaction(async tx => {
        if (deck.creatorName) {
            await writePublicName(tx, ownerId, deck.creatorName);
        }
        return tx.sharedDeck.upsert({
            where: { ownerId_setId_kind: { ownerId, setId: deck.setId, kind } },
            create: { id: randomUUID(), ownerId, setId: deck.setId, kind, ...snapshot },
            update: snapshot, select: publicFields,
        });
    });
}
export async function deleteSharedDeck(database: PrismaClient, ownerId: string, id: string) {
    // A caller cannot revoke another account's share, even with its public URL.
    return (await database.sharedDeck.deleteMany({ where: { id, ownerId } })).count > 0;
}
