import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import seed from '@/data/unit1.json';
import { MAX_SHARE_BYTES } from '@/lib/sharing-schema';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getStackServerApp: vi.fn(), getDatabase: vi.fn(), getOwnedShare: vi.fn(), publishSharedDeck: vi.fn(), getSharedDeck: vi.fn(), deleteSharedDeck: vi.fn() }));
vi.mock('@/lib/stack-server', () => ({ getStackServerApp: mocks.getStackServerApp }));
vi.mock('@/lib/database', () => ({ getDatabase: mocks.getDatabase }));
vi.mock('@/lib/sharing-store', () => ({ getOwnedShare: mocks.getOwnedShare, publishSharedDeck: mocks.publishSharedDeck, getSharedDeck: mocks.getSharedDeck, deleteSharedDeck: mocks.deleteSharedDeck }));
import { GET, POST } from './route';
import { GET as publicGET, DELETE } from './[id]/route';

const id = 'ed041eaf-0608-47d3-8998-70ac93739042';
const context = { params: Promise.resolve({ id }) };
const deck = { setId: 'unit-1', name: 'Unit 1', entries: seed };
const shared = { id, name: deck.name, entries: seed, updatedAt: new Date('2026-11-07T12:00:00.000Z') };
function request(body?: unknown, headers: Record<string, string> = {}, url = 'http://localhost/api/shares?setId=unit-1') {
    return new NextRequest(url, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer test-token', ...headers }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
}
beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv('DATABASE_URL', 'postgresql://unused');
    mocks.getStackServerApp.mockReturnValue({ getUser: mocks.getUser });
    mocks.getUser.mockResolvedValue({ id: 'verified-owner' });
    mocks.getDatabase.mockReturnValue({ test: 'database' });
    mocks.getOwnedShare.mockResolvedValue(null); mocks.getSharedDeck.mockResolvedValue(shared);
    mocks.publishSharedDeck.mockResolvedValue(shared); mocks.deleteSharedDeck.mockResolvedValue(true);
});
describe('sharing API privacy and validation', () => {
    it('requires bearer authentication to create, manage or revoke links', async () => {
        const unauthenticated = new NextRequest('http://localhost/api/shares');
        for (const handler of [GET, POST]) expect((await handler(unauthenticated)).status).toBe(401);
        expect((await DELETE(unauthenticated, context)).status).toBe(401);
        expect(mocks.getUser).not.toHaveBeenCalled();
    });
    it('verifies the actual request and rejects account changes or expired sessions', async () => {
        const req = request(); await GET(req);
        expect(mocks.getUser).toHaveBeenCalledWith({ tokenStore: req });
        expect((await POST(request(deck, { 'X-Mori-Owner': 'other' }))).status).toBe(409);
        mocks.getUser.mockResolvedValue(null);
        expect((await POST(request(deck))).status).toBe(401);
        expect(mocks.publishSharedDeck).not.toHaveBeenCalled();
    });
    it('publishes allowlisted words under the verified owner only', async () => {
        const response = await POST(request({ ...deck, ownerId: 'victim', progress: {}, entries: [{ ...seed[0], secret: 'private' }] }));
        expect(response.status).toBe(200);
        expect(mocks.publishSharedDeck).toHaveBeenCalledWith({ test: 'database' }, 'verified-owner', { ...deck, entries: [seed[0]] });
        expect(await response.json()).toEqual({ ...shared, updatedAt: shared.updatedAt.toISOString() });
        expect(response.headers.get('cache-control')).toBe('no-store');
    });
    it('queries sharing settings only within the verified account', async () => {
        expect(await (await GET(request())).json()).toEqual({ share: null });
        expect(mocks.getOwnedShare).toHaveBeenCalledWith({ test: 'database' }, 'verified-owner', 'unit-1');
        expect((await GET(request(undefined, {}, 'http://localhost/api/shares'))).status).toBe(400);
    });
    it('supports a verified owner’s folder snapshot and keeps folder/set lookups separate', async () => {
        const folder = { ...deck, kind: 'folder', sets: [{ id: 'unit-1', name: 'Unit 1', private: 'secret' }], ownerId: 'victim' };
        expect((await POST(request(folder))).status).toBe(200);
        expect(mocks.publishSharedDeck).toHaveBeenCalledWith(expect.anything(), 'verified-owner', { ...deck, kind: 'folder', sets: [{ id: 'unit-1', name: 'Unit 1' }] });
        await GET(request(undefined, {}, 'http://localhost/api/shares?setId=unit-1&kind=folder'));
        expect(mocks.getOwnedShare).toHaveBeenCalledWith(expect.anything(), 'verified-owner', 'unit-1', 'folder');
        expect((await GET(request(undefined, {}, 'http://localhost/api/shares?setId=unit-1&kind=unknown'))).status).toBe(400);
    });
    it('allows anonymous reads and marks them uncached and unindexed', async () => {
        const result = await publicGET(new NextRequest(`http://localhost/api/shares/${id}`), context);
        expect(result.status).toBe(200); expect(mocks.getUser).not.toHaveBeenCalled();
        expect(result.headers.get('cache-control')).toBe('no-store');
        expect(result.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    });
    it('returns the same unavailable response for revoked, unknown and invalid IDs', async () => {
        mocks.getSharedDeck.mockResolvedValue(null); mocks.deleteSharedDeck.mockResolvedValue(false);
        const responses = [await publicGET(request(), context), await publicGET(request(), { params: Promise.resolve({ id: 'invalid' }) }), await DELETE(request(), context)];
        for (const response of responses) {
            expect(response.status).toBe(404);
            expect(await response.json()).toEqual({ error: 'This shared set is unavailable.' });
        }
    });
    it('revoke includes both the link ID and the verified owner', async () => {
        expect((await DELETE(request(), context)).status).toBe(200);
        expect(mocks.deleteSharedDeck).toHaveBeenCalledWith({ test: 'database' }, 'verified-owner', id);
    });
    it.each(['{', 'null', '[]', '{}', JSON.stringify({ ...deck, entries: [] })])('rejects malformed data %s', async body => {
        expect((await POST(request(body))).status).toBe(400);
        expect(mocks.publishSharedDeck).not.toHaveBeenCalled();
    });
    it('checks declared and actual body limits before publishing', async () => {
        expect((await POST(request(deck, { 'Content-Length': String(MAX_SHARE_BYTES + 1) }))).status).toBe(413);
        expect((await POST(request(' '.repeat(MAX_SHARE_BYTES + 1)))).status).toBe(413);
        expect(mocks.publishSharedDeck).not.toHaveBeenCalled();
    });
    it('returns retryable failures without exposing database or authentication secrets', async () => {
        mocks.getUser.mockRejectedValueOnce(new Error('secret-key'));
        expect((await GET(request())).status).toBe(503);
        mocks.getSharedDeck.mockRejectedValue(new Error('postgresql://secret'));
        const result = await publicGET(request(), context);
        expect(result.status).toBe(503); expect(await result.text()).not.toContain('secret');
        mocks.getStackServerApp.mockReturnValue(null);
        expect((await POST(request(deck))).status).toBe(503);
    });
});
