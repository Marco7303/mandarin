import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { deleteSharedDeck, getOwnedShare, getSharedDeck, publishSharedDeck } from './sharing-store';
import { sharedDeckInputSchema } from './sharing-schema';
import seed from '../data/unit1.json';
import { savePublicName } from './profile-store';
import { findPublicSets, reportPublicSet } from './community-store';

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
beforeEach(async () => { await prisma.sharedDeck.deleteMany(); await prisma.creatorProfile.deleteMany(); await prisma.userState.deleteMany(); });
afterAll(async () => { await prisma?.$disconnect(); await server?.stop(); await db?.close(); });
describe('PostgreSQL shared snapshots', () => {
    it('round-trips vocabulary without exposing owner or source set fields', async () => {
        const published = await publishSharedDeck(prisma, 'owner-a', deck);
        expect(published.id).toMatch(/^[a-f0-9-]{36}$/);
        expect(Object.keys(published).sort()).toEqual(['creatorName', 'description', 'entries', 'id', 'isPublic', 'kind', 'name', 'sets', 'suppressed', 'updatedAt']);
        expect(published.isPublic).toBe(false);
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

describe('public library and existing accounts', () => {
    const publicDeck = { ...deck, isPublic: true, creatorName: 'Mandarin learner', description: 'Class vocabulary' };
    it('keeps old shares unlisted and existing account data and progress intact during migration', async () => {
        const old = await PGlite.create();
        try {
            for (const dir of ['202611030001_library', '202611070001_shared_decks'])
                await old.exec(fs.readFileSync(`prisma/migrations/${dir}/migration.sql`, 'utf8'));
            const state = { folders: [{ id: 'private', name: 'My class' }], progress: { 'word:chinese': { learned: true } } };
            await old.query('INSERT INTO user_state (user_id, state, revision) VALUES ($1, $2, $3)', ['already-signed-up', JSON.stringify(state), 17]);
            await old.query('INSERT INTO shared_deck (id, owner_id, set_id, name, entries) VALUES ($1, $2, $3, $4, $5)', ['old-link', 'already-signed-up', deck.setId, deck.name, JSON.stringify(deck.entries)]);
            const before = (await old.query('SELECT * FROM user_state')).rows;
            await old.exec(fs.readFileSync('prisma/migrations/20261111120000_public_library/migration.sql', 'utf8'));
            await old.exec(fs.readFileSync('prisma/migrations/20261111150000_shared_folders/migration.sql', 'utf8'));
            expect((await old.query('SELECT kind, sets, set_count FROM shared_deck')).rows).toEqual([{ kind: 'set', sets: [], set_count: 1 }]);
            expect((await old.query('SELECT * FROM user_state')).rows).toEqual(before);
            expect((await old.query('SELECT id, is_public, word_count FROM shared_deck')).rows).toEqual([{ id: 'old-link', is_public: false, word_count: 55 }]);
            expect((await old.query('SELECT * FROM creator_profile')).rows).toEqual([]);
        } finally { await old.close(); }
    });
    it('lists only explicitly public summaries, searches titles, topics and creators, and preserves link IDs', async () => {
        const unlisted = await publishSharedDeck(prisma, 'owner-a', deck);
        expect((await findPublicSets(prisma, { q: '' })).sets).toEqual([]);
        const published = await publishSharedDeck(prisma, 'owner-a', publicDeck);
        expect(published.id).toBe(unlisted.id);
        await publishSharedDeck(prisma, 'owner-b', { ...deck, name: 'Private search secret' });
        for (const q of ['UNIT', 'class', 'mandarin']) {
            const result = await findPublicSets(prisma, { q });
            expect(result.sets).toHaveLength(1);
            expect(Object.keys(result.sets[0]).sort()).toEqual(['creatorName', 'description', 'id', 'kind', 'name', 'setCount', 'updatedAt', 'wordCount']);
            expect(result.sets[0].wordCount).toBe(55);
        }
        expect((await findPublicSets(prisma, { q: 'secret' })).sets).toEqual([]);
        expect((await findPublicSets(prisma, { q: '%' })).sets).toEqual([]);
        expect((await findPublicSets(prisma, { q: '_' })).sets).toEqual([]);
        const saved = await publishSharedDeck(prisma, 'owner-a', { ...deck, isPublic: false });
        expect(saved.id).toBe(published.id);
        expect((await findPublicSets(prisma, { q: '' })).sets).toEqual([]);
        expect(await getSharedDeck(prisma, published.id)).not.toBeNull();
    });
    it('remembers an opted-in public name across sets without changing private account state', async () => {
        await prisma.userState.create({ data: { userId: 'existing-account', state: { secret: 'progress' }, revision: 7 } });
        const before = await prisma.userState.findUnique({ where: { userId: 'existing-account' } });
        await publishSharedDeck(prisma, 'existing-account', publicDeck);
        await publishSharedDeck(prisma, 'existing-account', { ...publicDeck, setId: 'second', entries: publicDeck.entries.map(e => ({ ...e, setId: 'second' })), creatorName: 'New public name' });
        expect(await prisma.creatorProfile.findUnique({ where: { userId: 'existing-account' } })).toEqual({ userId: 'existing-account', displayName: 'New public name' });
        expect((await findPublicSets(prisma, { q: 'New public name' })).sets).toHaveLength(2);
        expect(await prisma.userState.findUnique({ where: { userId: 'existing-account' } })).toEqual(before);
        // An old client updating vocabulary must not accidentally unpublish a public set.
        expect((await publishSharedDeck(prisma, 'existing-account', deck)).isPublic).toBe(true);
    });
    it('paginates with stable ties, including after a result is unpublished or deleted', async () => {
        await prisma.sharedDeck.createMany({ data: Array.from({ length: 23 }, (_, i) => ({
            id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, ownerId: 'owner', setId: `s${i}`,
            name: `Set ${i}`, entries: [], isPublic: true, creatorName: 'Creator', updatedAt: new Date('2026-11-11T12:00:00Z'),
        })) });
        const first = await findPublicSets(prisma, { q: '' });
        expect(first.sets).toHaveLength(20); expect(first.nextCursor).not.toBeNull();
        await prisma.sharedDeck.delete({ where: { id: first.sets.at(-1)!.id } });
        const second = await findPublicSets(prisma, { q: '', cursor: first.nextCursor! });
        expect(second.sets).toHaveLength(3); expect(second.nextCursor).toBeNull();
        expect(new Set([...first.sets, ...second.sets].map(s => s.id)).size).toBe(23);
    });
    it('accepts one report per account, excludes unlisted content, and keeps reviewed removals hidden on updates', async () => {
        const published = await publishSharedDeck(prisma, 'owner-a', publicDeck);
        const report = { reason: 'Inaccurate content' as const, details: 'Wrong pronunciation' };
        expect(await reportPublicSet(prisma, 'reporter', published.id, report)).toBe(1);
        expect(await reportPublicSet(prisma, 'reporter', published.id, report)).toBe(0);
        const unlisted = await publishSharedDeck(prisma, 'owner-b', deck);
        expect(await reportPublicSet(prisma, 'reporter', unlisted.id, report)).toBe(0);
        await prisma.sharedDeck.update({ where: { id: published.id }, data: { suppressed: true } });
        expect((await findPublicSets(prisma, { q: '' })).sets).toEqual([]);
        expect(await getSharedDeck(prisma, published.id)).toBeNull();
        expect((await getOwnedShare(prisma, 'owner-a', deck.setId))?.suppressed).toBe(true);
        await publishSharedDeck(prisma, 'owner-a', publicDeck);
        expect(await getSharedDeck(prisma, published.id)).toBeNull();
        await deleteSharedDeck(prisma, 'owner-a', published.id);
        expect(await prisma.deckReport.count()).toBe(0);
    });
});

describe('folder snapshots', () => {
    const folder = sharedDeckInputSchema.parse({
        kind: 'folder', setId: 'unit-1', name: 'Entire class', isPublic: true, creatorName: 'Class teacher',
        sets: [{ id: 'unit-1', name: 'Unit 1' }, { id: 'unit-2', name: 'Unit 2' }],
        entries: [seed[0], { ...seed[1], setId: 'unit-2' }],
    });
    it('keeps a folder independent from a set with the same source ID, and never changes an existing library', async () => {
        await prisma.userState.create({ data: { userId: 'existing', state: { folders: ['private'], progress: { learned: true } }, revision: 12 } });
        const before = await prisma.userState.findUnique({ where: { userId: 'existing' } });
        const set = await publishSharedDeck(prisma, 'existing', deck);
        const first = await publishSharedDeck(prisma, 'existing', folder);
        expect(first.id).not.toBe(set.id);
        expect(first.kind).toBe('folder'); expect(first.sets).toEqual(folder.sets);
        expect(first.entries).toHaveLength(2);
        expect((await getOwnedShare(prisma, 'existing', 'unit-1'))?.id).toBe(set.id);
        expect((await getOwnedShare(prisma, 'existing', 'unit-1', 'folder'))?.id).toBe(first.id);
        expect(await getOwnedShare(prisma, 'other', 'unit-1', 'folder')).toBeNull();
        const updated = await publishSharedDeck(prisma, 'existing', { ...folder, sets: folder.sets!.slice(0, 1), entries: [seed[0]] });
        expect(updated.id).toBe(first.id); expect(updated.sets).toHaveLength(1);
        expect((await getSharedDeck(prisma, set.id))?.entries).toHaveLength(55);
        expect(await prisma.userState.findUnique({ where: { userId: 'existing' } })).toEqual(before);
    });
    it('discovers folder metadata only, filters by kind, unpublishes and revokes without affecting constituent sets', async () => {
        const set = await publishSharedDeck(prisma, 'owner', { ...deck, isPublic: true, creatorName: 'Class teacher' });
        const published = await publishSharedDeck(prisma, 'owner', folder);
        const all = (await findPublicSets(prisma, { q: '' })).sets;
        expect(all).toHaveLength(2);
        expect(all.find(row => row.kind === 'folder')).toMatchObject({ id: published.id, setCount: 2, wordCount: 2 });
        expect(all[0]).not.toHaveProperty('sets'); expect(all[0]).not.toHaveProperty('entries');
        expect((await findPublicSets(prisma, { q: 'class', kind: 'folder' })).sets.map(row => row.id)).toEqual([published.id]);
        expect((await findPublicSets(prisma, { q: '', kind: 'set' })).sets.map(row => row.id)).toEqual([set.id]);
        await publishSharedDeck(prisma, 'owner', { ...folder, isPublic: false });
        expect((await findPublicSets(prisma, { q: '', kind: 'folder' })).sets).toEqual([]);
        expect(await getSharedDeck(prisma, published.id)).not.toBeNull();
        expect(await deleteSharedDeck(prisma, 'other', published.id)).toBe(false);
        expect(await deleteSharedDeck(prisma, 'owner', published.id)).toBe(true);
        expect(await getSharedDeck(prisma, published.id)).toBeNull();
        expect(await getSharedDeck(prisma, set.id)).not.toBeNull();
    });
    it('applies reporting and moderation to the entire folder snapshot, without allowing republishing to bypass it', async () => {
        const published = await publishSharedDeck(prisma, 'owner', folder);
        expect(await reportPublicSet(prisma, 'reporter', published.id, { reason: 'Inaccurate content', details: '' })).toBe(1);
        await prisma.sharedDeck.update({ where: { id: published.id }, data: { suppressed: true } });
        expect(await getSharedDeck(prisma, published.id)).toBeNull();
        await publishSharedDeck(prisma, 'owner', folder);
        expect((await getOwnedShare(prisma, 'owner', folder.setId, 'folder'))?.suppressed).toBe(true);
        expect((await findPublicSets(prisma, { q: '', kind: 'folder' })).sets).toEqual([]);
        await deleteSharedDeck(prisma, 'owner', published.id);
        expect(await prisma.deckReport.count()).toBe(0);
    });
});


describe('public profile settings', () => {
    it('adds a name to an existing account and renames its published sets and folders without changing personal data or visibility', async () => {
        await prisma.userState.create({ data: { userId: 'existing', state: { private: 'words and progress' }, revision: 19 } });
        const before = await prisma.userState.findUnique({ where: { userId: 'existing' } });
        expect(await savePublicName(prisma, 'existing', 'First name')).toEqual({ displayName: 'First name' });
        const set = await publishSharedDeck(prisma, 'existing', { ...deck, creatorName: 'First name', isPublic: true });
        const folder = await publishSharedDeck(prisma, 'existing', { ...deck, kind: 'folder', sets: [{ id: deck.setId, name: deck.name }], creatorName: 'First name', isPublic: false });
        const other = await publishSharedDeck(prisma, 'other', { ...deck, creatorName: 'Other learner', isPublic: true });
        await prisma.sharedDeck.update({ where: { id: folder.id }, data: { suppressed: true } });
        await savePublicName(prisma, 'existing', 'Renamed learner');
        expect(await prisma.creatorProfile.findUnique({ where: { userId: 'existing' } })).toEqual({ userId: 'existing', displayName: 'Renamed learner' });
        expect(await getSharedDeck(prisma, set.id)).toMatchObject({ id: set.id, creatorName: 'Renamed learner', entries: set.entries, isPublic: true });
        expect(await getOwnedShare(prisma, 'existing', deck.setId, 'folder')).toMatchObject({ id: folder.id, creatorName: 'Renamed learner', entries: folder.entries, isPublic: false, suppressed: true });
        expect(await getSharedDeck(prisma, other.id)).toMatchObject({ creatorName: 'Other learner' });
        expect(await prisma.userState.findUnique({ where: { userId: 'existing' } })).toEqual(before);
    });
    it('rolls back the name and all snapshots together if updating a shared snapshot fails', async () => {
        await publishSharedDeck(prisma, 'owner', { ...deck, creatorName: 'Original name' });
        await prisma.$executeRawUnsafe(`ALTER TABLE shared_deck ADD CONSTRAINT test_name CHECK (creator_name <> 'Rejected name')`);
        try {
            await expect(savePublicName(prisma, 'owner', 'Rejected name')).rejects.toThrow();
            expect((await prisma.creatorProfile.findUnique({ where: { userId: 'owner' } }))?.displayName).toBe('Original name');
            expect((await getOwnedShare(prisma, 'owner', deck.setId))?.creatorName).toBe('Original name');
        } finally { await prisma.$executeRawUnsafe('ALTER TABLE shared_deck DROP CONSTRAINT test_name'); }
    });
});
