import type { Prisma, PrismaClient } from '@/generated/prisma/client';

export async function writePublicName(tx: Prisma.TransactionClient, userId: string, displayName: string) {
    await tx.creatorProfile.upsert({ where: { userId }, create: { userId, displayName }, update: { displayName } });
    // Renaming a creator does not republish any vocabulary or change visibility.
    await tx.sharedDeck.updateMany({ where: { ownerId: userId }, data: { creatorName: displayName } });
    return { displayName };
}
export function savePublicName(database: PrismaClient, userId: string, displayName: string) {
    return database.$transaction(tx => writePublicName(tx, userId, displayName));
}
