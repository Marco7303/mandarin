import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { loadLibrary, saveLibrary, SyncConflict } from './library-store';
import { snapshotSchema } from './cloud-schema';
import seed from '../data/unit1.json';

const state = snapshotSchema.parse({ folders: [{ id: 'mandarin-class', name: 'Mandarin Class' }], sets: [{ id: 'unit-1', folderId: 'mandarin-class', name: 'Unit 1' }], entries: seed, stars: { 'unit-1-1:english': true }, progress: {}, preferences: { prompt: 'mixed' } });
let db: PGlite, server: PGLiteSocketServer, prisma: PrismaClient;
let connectionString: string;
async function prismaCommand(...args: string[]) {
    return promisify(execFile)(process.execPath, [path.resolve('node_modules/prisma/build/index.js'), ...args], {
        env: { ...process.env, DATABASE_URL: connectionString, DIRECT_DATABASE_URL: connectionString },
    });
}
beforeAll(async () => {
    db = await PGlite.create();
    server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1', maxConnections: 4 });
    await server.start();
    connectionString = `postgresql://postgres:postgres@${server.getServerConn()}/postgres`;
    await prismaCommand('migrate', 'deploy');
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 4 }) });
});
beforeEach(async () => { await prisma.userState.deleteMany(); });
afterAll(async () => { await prisma?.$disconnect(); await server?.stop(); await db?.close(); });

describe('Prisma + PostgreSQL library persistence', () => {
    it('deploys migrations idempotently and matches the Prisma schema', async () => {
        const result = await prismaCommand('migrate', 'deploy');
        expect(result.stdout).toContain('No pending migrations');
        await prismaCommand('migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code');
    });
    it('starts empty and round-trips all 55 Excel entries and optional metadata', async () => {
        expect(await loadLibrary(prisma, 'stack-a')).toBeNull();
        const saved = await saveLibrary(prisma, 'stack-a', state, null);
        expect(saved.revision).toBe(1);
        expect(saved.updatedAt).toBeInstanceOf(Date);
        expect((await loadLibrary(prisma, 'stack-a'))?.state).toEqual(state);
        expect(state.entries).toHaveLength(55);
    });
    it('isolates two accounts with arbitrary Stack string IDs', async () => {
        await saveLibrary(prisma, 'stack-a', state, null);
        expect(await loadLibrary(prisma, 'stack-b')).toBeNull();
        await saveLibrary(prisma, 'stack-b', { ...state, stars: {} }, null);
        await saveLibrary(prisma, 'stack-a', { ...state, stars: { 'unit-1-1:pinyin': true } }, 1);
        expect((await loadLibrary(prisma, 'stack-b'))?.state).toEqual({ ...state, stars: {} });
        expect((await loadLibrary(prisma, 'stack-a'))?.revision).toBe(2);
    });
    it('rejects duplicate creation without replacing the first library', async () => {
        await saveLibrary(prisma, 'a', state, null);
        await expect(saveLibrary(prisma, 'a', { ...state, entries: [] }, null)).rejects.toBeInstanceOf(SyncConflict);
        expect((await loadLibrary(prisma, 'a'))?.state).toEqual(state);
    });
    it('rejects a numbered update when no cloud library exists', async () => {
        await expect(saveLibrary(prisma, 'a', state, 1)).rejects.toBeInstanceOf(SyncConflict);
        expect(await loadLibrary(prisma, 'a')).toBeNull();
    });
    it('rejects stale writes and preserves the winning update', async () => {
        await saveLibrary(prisma, 'a', state, null);
        const next = { ...state, stars: {} };
        expect((await saveLibrary(prisma, 'a', next, 1)).revision).toBe(2);
        await expect(saveLibrary(prisma, 'a', state, 1)).rejects.toBeInstanceOf(SyncConflict);
        expect((await loadLibrary(prisma, 'a'))?.state).toEqual(next);
    });
    it('allows exactly one of two simultaneous creates', async () => {
        const results = await Promise.allSettled([saveLibrary(prisma, 'a', state, null), saveLibrary(prisma, 'a', state, null)]);
        expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(x => x.status === 'rejected')).toHaveLength(1);
        expect((await loadLibrary(prisma, 'a'))?.revision).toBe(1);
    });
    it('allows exactly one of two simultaneous updates against the same revision', async () => {
        await saveLibrary(prisma, 'a', state, null);
        const results = await Promise.allSettled([saveLibrary(prisma, 'a', state, 1), saveLibrary(prisma, 'a', { ...state, stars: {} }, 1)]);
        expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(x => x.status === 'rejected')).toHaveLength(1);
        expect((await loadLibrary(prisma, 'a'))?.revision).toBe(2);
    });
    it('parameterizes user IDs and snapshot text', async () => {
        const userId = "a'; DROP TABLE user_state; --";
        const next = { ...state, notes: "'; DROP TABLE user_state; --" };
        await saveLibrary(prisma, userId, next, null);
        expect((await loadLibrary(prisma, userId))?.state).toEqual(next);
        expect(await prisma.userState.count()).toBe(1);
    });
});
