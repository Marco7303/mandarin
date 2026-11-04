import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SyncConflict } from '@/lib/library-store';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getStackServerApp: vi.fn(), getDatabase: vi.fn(), loadLibrary: vi.fn(), saveLibrary: vi.fn() }));
vi.mock('@/lib/stack-server', () => ({ getStackServerApp: mocks.getStackServerApp }));
vi.mock('@/lib/database', () => ({ getDatabase: mocks.getDatabase }));
vi.mock('@/lib/library-store', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/library-store')>(), loadLibrary: mocks.loadLibrary, saveLibrary: mocks.saveLibrary }));
import { GET, POST } from './route';

const state = { folders: [], sets: [], entries: [], progress: {}, stars: {} };
function request(body?: unknown, headers: Record<string, string> = {}) {
    return new NextRequest('http://localhost/api/sync', { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer stackauth_test', ...headers }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
}
beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('DATABASE_URL', 'postgresql://unused');
    mocks.getStackServerApp.mockReturnValue({ getUser: mocks.getUser });
    mocks.getUser.mockResolvedValue({ id: 'verified-stack-user' });
    mocks.getDatabase.mockReturnValue({ test: 'database' });
    mocks.loadLibrary.mockResolvedValue(null);
    mocks.saveLibrary.mockResolvedValue({ updatedAt: new Date('2026-11-03T12:00:00.000Z'), revision: 1 });
});

describe('authenticated sync API boundary', () => {
    it('requires bearer authorization for both methods, even if cookies exist', async () => {
        for (const method of [GET, POST]) {
            const result = await method(new NextRequest('http://localhost/api/sync', { headers: { Cookie: 'user=attacker' } }));
            expect(result.status).toBe(401);
            expect(result.headers.get('cache-control')).toBe('no-store');
        }
        expect(mocks.getUser).not.toHaveBeenCalled();
    });
    it('passes the request to Stack for authentication rather than trusting an owner field', async () => {
        const req = request(); await GET(req);
        expect(mocks.getUser).toHaveBeenCalledWith({ tokenStore: req });
        expect(mocks.loadLibrary).toHaveBeenCalledWith({ test: 'database' }, 'verified-stack-user');
    });
    it('rejects expired or invalid sessions without reading the database', async () => {
        mocks.getUser.mockResolvedValue(null);
        expect((await GET(request())).status).toBe(401);
        expect(mocks.getDatabase).not.toHaveBeenCalled();
    });
    it('rejects an account change between reading the session and acquiring its token', async () => {
        expect((await POST(request({ state, expectedRevision: null }, { 'X-Mori-Owner': 'other' }))).status).toBe(409);
        expect(mocks.saveLibrary).not.toHaveBeenCalled();
    });
    it('fails closed when auth configuration or the database URL is missing', async () => {
        mocks.getStackServerApp.mockReturnValue(null);
        expect((await GET(request())).status).toBe(503);
        mocks.getStackServerApp.mockReturnValue({ getUser: mocks.getUser });
        vi.stubEnv('DATABASE_URL', '');
        expect((await GET(request())).status).toBe(503);
        expect(mocks.getDatabase).not.toHaveBeenCalled();
    });
    it('handles authentication transport failure without leaking secrets', async () => {
        mocks.getUser.mockRejectedValue(new Error('secret-server-key'));
        const result = await GET(request());
        expect(result.status).toBe(503);
        expect(await result.text()).not.toContain('secret-server-key');
    });
    it('returns an empty library for a new account and serializes existing dates', async () => {
        expect(await (await GET(request())).json()).toEqual({ state: null, revision: null });
        mocks.loadLibrary.mockResolvedValue({ state, revision: 2, updatedAt: new Date('2026-11-03T12:00:00.000Z') });
        expect(await (await GET(request())).json()).toEqual({ state, revision: 2, updatedAt: '2026-11-03T12:00:00.000Z' });
    });
    it('ignores a malicious body owner and writes only to the authenticated account', async () => {
        const result = await POST(request({ state, expectedRevision: null, userId: 'victim' }));
        expect(result.status).toBe(200);
        expect(mocks.saveLibrary).toHaveBeenCalledWith({ test: 'database' }, 'verified-stack-user', state, null);
    });
    it('passes the expected version for optimistic updates', async () => {
        expect((await POST(request({ state, expectedRevision: 7 }))).status).toBe(200);
        expect(mocks.saveLibrary.mock.calls[0][3]).toBe(7);
    });
    it.each([undefined, 0, -1, 1.5, '1', 2147483647, 9007199254740992])('rejects invalid or absent revision %s', async expectedRevision => {
        expect((await POST(request({ state, expectedRevision }))).status).toBe(400);
        expect(mocks.saveLibrary).not.toHaveBeenCalled();
    });
    it.each(['{', 'null', '[]', '{}', JSON.stringify({ state: { ...state, stars: { 'missing:mixed': true } }, expectedRevision: null })])('rejects malformed payload %s', async body => {
        expect((await POST(request(body))).status).toBe(400);
        expect(mocks.saveLibrary).not.toHaveBeenCalled();
    });
    it('enforces the declared body size before parsing', async () => {
        expect((await POST(request({ state, expectedRevision: null }, { 'Content-Length': String(9 * 1024 * 1024) }))).status).toBe(413);
        expect(mocks.saveLibrary).not.toHaveBeenCalled();
    });
    it('enforces streamed size even without content-length', async () => {
        expect((await POST(request(' '.repeat(8 * 1024 * 1024 + 1)))).status).toBe(413);
        expect(mocks.saveLibrary).not.toHaveBeenCalled();
    });
    it('reports stale writes as conflicts', async () => {
        mocks.saveLibrary.mockRejectedValue(new SyncConflict('Your cloud library changed'));
        expect((await POST(request({ state, expectedRevision: 1 }))).status).toBe(409);
    });
    it('reports database outages as retryable failures without exposing connection strings', async () => {
        mocks.loadLibrary.mockRejectedValue(new Error('postgresql://secret'));
        mocks.saveLibrary.mockRejectedValue(new Error('postgresql://secret'));
        for (const response of [await GET(request()), await POST(request({ state, expectedRevision: null }))]) {
            expect(response.status).toBe(503);
            expect(await response.text()).not.toContain('postgresql://secret');
        }
    });
});
