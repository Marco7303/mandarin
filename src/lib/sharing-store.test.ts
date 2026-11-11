import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { deleteSharedDeck, getOwnedShare, getSharedDeck, publishSharedDeck } from './sharing-store';
import { sharedDeckInputSchema } from './sharing-schema';
import seed from '../data/unit1.json';

const deck = sharedDeckInputSchema.parse({ setId: 'unit-1', name: 'Unit 1', entries: seed });
let db: PGlite, server: PGLiteSocketServer, prisma: PrismaClient;
beforeAll(async () => {
    db = await PGlite.create();
    server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1', maxConnections: 4 });
    await server.start();
    const connectionString = `postgresql://postgres:postgres@${server.getServerConn()}/postgres`;
    await promisify(execFile)(process.execPath, [path.resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
        env: { ...process.env, DATABASE_URL: connectionString, DIRECT_DATABASE_URL: connectionString },
    });
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 4 }) });
});
beforeEach(async () => { await prisma.sharedDeck.deleteMany(); });
afterAll(async () => { await prisma?.$disconnect(); await server?.stop(); await db?.close(); });
describe('PostgreSQL shared snapshots', () => {
    it('round-trips vocabulary without exposing owner or source set fields', async () => {
        const published = await publishSharedDeck(prisma, 'owner-a', deck);
        expect(published.id).toMatch(/^[a-f0-9-]{36}$/);
        expect(Object.keys(published).sort()).toEqual(['entries', 'id', 'name', 'updatedAt']);
        expect(published.entries).toEqual(seed);
        expect(await getSharedDeck(prisma, published.id)).toEqual(published);
    });
    it('updates the same link explicitly while keeping other accounts independent', async () => {
        const first = await publishSharedDeck(prisma, 'owner-a', deck);
        const other = await publishSharedDeck(prisma, 'owner-b', deck);
        const update = await publishSharedDeck(prisma, 'owner-a', { ...deck, name: 'Revised', entries: deck.entries.slice(0, 2) });
        expect(update.id).toBe(first.id); expect(update.entries).toHaveLength(2);
        expect(other.id).not.toBe(first.id);
        expect((await getOwnedShare(prisma, 'owner-b', deck.setId))?.name).toBe('Unit 1');
        expect(await getOwnedShare(prisma, 'owner-c', deck.setId)).toBeNull();
        expect(await prisma.sharedDeck.count()).toBe(2);
    });
    it('prevents revoking another user’s link and makes revocation immediate', async () => {
        const first = await publishSharedDeck(prisma, 'owner-a', deck);
        expect(await deleteSharedDeck(prisma, 'owner-b', first.id)).toBe(false);
        expect(await getSharedDeck(prisma, first.id)).not.toBeNull();
        expect(await deleteSharedDeck(prisma, 'owner-a', first.id)).toBe(true);
        expect(await getSharedDeck(prisma, first.id)).toBeNull();
        expect(await getOwnedShare(prisma, 'owner-a', deck.setId)).toBeNull();
        const republished = await publishSharedDeck(prisma, 'owner-a', deck);
        expect(republished.id).not.toBe(first.id);
        expect(await getSharedDeck(prisma, first.id)).toBeNull();
    });
    it('does not read or modify personal learning state', async () => {
        await prisma.userState.create({ data: { userId: 'owner-a', state: { private: 'progress' } } });
        const published = await publishSharedDeck(prisma, 'owner-a', deck);
        await deleteSharedDeck(prisma, 'owner-a', published.id);
        expect((await prisma.userState.findUnique({ where: { userId: 'owner-a' } }))?.state).toEqual({ private: 'progress' });
    });
});
