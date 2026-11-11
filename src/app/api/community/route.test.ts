import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getStackServerApp: vi.fn(), getDatabase: vi.fn(), findPublicSets: vi.fn(), reportPublicSet: vi.fn(), profile: vi.fn(), savePublicName: vi.fn() }));
vi.mock('@/lib/stack-server', () => ({ getStackServerApp: mocks.getStackServerApp }));
vi.mock('@/lib/profile-store', () => ({ savePublicName: mocks.savePublicName }));
vi.mock('@/lib/database', () => ({ getDatabase: mocks.getDatabase }));
vi.mock('@/lib/community-store', () => ({ findPublicSets: mocks.findPublicSets, reportPublicSet: mocks.reportPublicSet }));
import { GET } from './route';
import { POST as profilePOST, GET as profileGET } from './profile/route';
import { POST } from './[id]/report/route';
const id = 'ed041eaf-0608-47d3-8998-70ac93739042';
const context = { params: Promise.resolve({ id }) };
function request(path = '', body?: unknown, owner = 'owner') {
    return new NextRequest(`http://localhost/api/community${path}`, {
        method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer test', 'X-Mori-Owner': owner },
        ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
}
beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv('DATABASE_URL', 'postgresql://unused');
    mocks.getStackServerApp.mockReturnValue({ getUser: mocks.getUser });
    mocks.getUser.mockResolvedValue({ id: 'owner', primaryEmail: 'never-expose@example.com' });
    mocks.getDatabase.mockReturnValue({ creatorProfile: { findUnique: mocks.profile } });
    mocks.findPublicSets.mockResolvedValue({ sets: [], nextCursor: null });
    mocks.profile.mockResolvedValue(null);
    mocks.savePublicName.mockResolvedValue({ displayName: 'Learner' });
});
describe('community API', () => {
    it('allows anonymous bounded discovery, with no caching of revoked listings', async () => {
        const response = await GET(new NextRequest('http://localhost/api/community?q=%E5%AD%B8'));
        expect(response.status).toBe(200);
        expect(mocks.getUser).not.toHaveBeenCalled();
        expect(mocks.findPublicSets).toHaveBeenCalledWith(expect.anything(), { q: '學' });
        await GET(request('?kind=folder'));
        expect(mocks.findPublicSets).toHaveBeenCalledWith(expect.anything(), { q: '', kind: 'folder' });
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toEqual({ sets: [], nextCursor: null });
    });
    it('rejects oversized searches and malformed cursors before querying', async () => {
        for (const path of [`?q=${'x'.repeat(101)}`, '?kind=invalid', '?cursor=bad', '?cursor=2026-11-11T12:00:00Z%7Cbad'])
            expect((await GET(request(path))).status).toBe(400);
        expect(mocks.findPublicSets).not.toHaveBeenCalled();
    });
    it('gives an existing account an empty public name without deriving it from email', async () => {
        const response = await profileGET(request('/profile'));
        expect(await response.json()).toEqual({ displayName: '' });
        expect(mocks.profile).toHaveBeenCalledWith({ where: { userId: 'owner' }, select: { displayName: true } });
        mocks.profile.mockResolvedValue({ displayName: 'Learner' });
        expect(await (await profileGET(request('/profile'))).json()).toEqual({ displayName: 'Learner' });
    });
    it('requires authentication and current ownership for profile and report requests', async () => {
        const anonymous = new NextRequest('http://localhost/api/community');
        expect((await profileGET(anonymous)).status).toBe(401);
        expect((await profilePOST(anonymous)).status).toBe(401);
        expect((await profilePOST(request('/profile', { displayName: 'Learner' }, 'someone-else'))).status).toBe(409);
        expect(mocks.savePublicName).not.toHaveBeenCalled();
        expect((await POST(anonymous, context)).status).toBe(401);
        expect((await profileGET(request('/profile', undefined, 'another-account'))).status).toBe(409);
        mocks.getUser.mockResolvedValue(null);
        expect((await POST(request('', { reason: 'Inaccurate content' }), context)).status).toBe(401);
        expect(mocks.reportPublicSet).not.toHaveBeenCalled();
    });
    it('validates reports and uses only the verified reporter identity', async () => {
        const response = await POST(request('', { reason: 'Inaccurate content', details: 'Wrong tone', reporterId: 'victim', ownerId: 'victim' }), context);
        expect(response.status).toBe(200);
        expect(mocks.reportPublicSet).toHaveBeenCalledWith(expect.anything(), 'owner', id, { reason: 'Inaccurate content', details: 'Wrong tone' });
        for (const body of ['{', { reason: 'anything' }, { reason: 'Copyright or spam', details: 'x'.repeat(501) }])
            expect((await POST(request('', body), context)).status).toBe(400);
        expect((await POST(request('', ' '.repeat(4097)), context)).status).toBe(413);
    });
    it('edits only the verified account’s public name with bounded validated input', async () => {
        const response = await profilePOST(request('/profile', { displayName: ' Learner ', userId: 'victim', email: 'private@example.com' }));
        expect(response.status).toBe(200); expect(await response.json()).toEqual({ displayName: 'Learner' });
        expect(mocks.savePublicName).toHaveBeenCalledWith(expect.anything(), 'owner', 'Learner');
        for (const body of ['{', {}, { displayName: '' }, { displayName: 'x' }, { displayName: 'x'.repeat(51) }, { displayName: 'private@example.com' }])
            expect((await profilePOST(request('/profile', body))).status).toBe(400);
        expect((await profilePOST(request('/profile', ' '.repeat(4097)))).status).toBe(413);
        mocks.savePublicName.mockRejectedValue(new Error('postgresql://secret'));
        const failed = await profilePOST(request('/profile', { displayName: 'Learner' }));
        expect(failed.status).toBe(503); expect(await failed.text()).not.toContain('secret');
    });
    it('does not expose database or session errors', async () => {
        mocks.findPublicSets.mockRejectedValue(new Error('postgresql://secret'));
        const response = await GET(request());
        expect(response.status).toBe(503); expect(await response.text()).not.toContain('secret');
        mocks.reportPublicSet.mockRejectedValue(new Error('secret'));
        expect((await POST(request('', { reason: 'Copyright or spam' }), context)).status).toBe(503);
        mocks.profile.mockRejectedValue(new Error('secret'));
        expect((await profileGET(request('/profile'))).status).toBe(503);
    });
});
