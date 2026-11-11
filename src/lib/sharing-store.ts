import { randomUUID } from 'node:crypto';
import type { PrismaClient, Prisma } from '@/generated/prisma/client';
import type { SharedDeckInput } from './sharing-schema';

const publicFields = { id: true, name: true, entries: true, updatedAt: true, isPublic: true, description: true, creatorName: true, suppressed: true } as const;
export function getSharedDeck(database: PrismaClient, id: string) {
    return database.sharedDeck.findFirst({ where: { id, suppressed: false }, select: publicFields });
}
export function getOwnedShare(database: PrismaClient, ownerId: string, setId: string) {
    return database.sharedDeck.findUnique({ where: { ownerId_setId: { ownerId, setId } }, select: publicFields });
}
export function publishSharedDeck(database: PrismaClient, ownerId: string, deck: SharedDeckInput) {
    const snapshot = { name: deck.name, entries: deck.entries as Prisma.InputJsonValue, wordCount: deck.entries.length,
        ...(deck.isPublic !== undefined ? { isPublic: deck.isPublic } : {}),
        ...(deck.description !== undefined ? { description: deck.description } : {}),
        ...(deck.creatorName ? { creatorName: deck.creatorName } : {}),
    };
    return database.$transaction(async tx => {
        if (deck.creatorName) {
            await tx.creatorProfile.upsert({ where: { userId: ownerId }, create: { userId: ownerId, displayName: deck.creatorName }, update: { displayName: deck.creatorName } });
            await tx.sharedDeck.updateMany({ where: { ownerId }, data: { creatorName: deck.creatorName } });
        }
        return tx.sharedDeck.upsert({
            where: { ownerId_setId: { ownerId, setId: deck.setId } },
            create: { id: randomUUID(), ownerId, setId: deck.setId, ...snapshot },
            update: snapshot, select: publicFields,
        });
    });
}
export async function deleteSharedDeck(database: PrismaClient, ownerId: string, id: string) {
    // A caller cannot revoke another account's share, even with its public URL.
    return (await database.sharedDeck.deleteMany({ where: { id, ownerId } })).count > 0;
}
