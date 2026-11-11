import { randomUUID } from 'node:crypto';
import type { PrismaClient, Prisma } from '@/generated/prisma/client';
import type { SharedDeckInput } from './sharing-schema';

const publicFields = { id: true, name: true, entries: true, updatedAt: true } as const;
export function getSharedDeck(database: PrismaClient, id: string) {
    return database.sharedDeck.findUnique({ where: { id }, select: publicFields });
}
export function getOwnedShare(database: PrismaClient, ownerId: string, setId: string) {
    return database.sharedDeck.findUnique({ where: { ownerId_setId: { ownerId, setId } }, select: publicFields });
}
export function publishSharedDeck(database: PrismaClient, ownerId: string, deck: SharedDeckInput) {
    const snapshot = { name: deck.name, entries: deck.entries as Prisma.InputJsonValue };
    return database.sharedDeck.upsert({
        where: { ownerId_setId: { ownerId, setId: deck.setId } },
        create: { id: randomUUID(), ownerId, setId: deck.setId, ...snapshot },
        update: snapshot, select: publicFields,
    });
}
export async function deleteSharedDeck(database: PrismaClient, ownerId: string, id: string) {
    // A caller cannot revoke another account's share, even with its public URL.
    return (await database.sharedDeck.deleteMany({ where: { id, ownerId } })).count > 0;
}
