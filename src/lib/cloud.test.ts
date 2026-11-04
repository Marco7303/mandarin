import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ constructor: vi.fn(), getUser: vi.fn(), getAuthorizationHeader: vi.fn(), signInWithCredential: vi.fn(), signUpWithCredential: vi.fn(), signOut: vi.fn() }));
vi.mock('@stackframe/stack', () => ({ StackClientApp: class {
    constructor(options: unknown) { sdk.constructor(options); }
    getUser = sdk.getUser;
    getAuthorizationHeader = sdk.getAuthorizationHeader;
    signInWithCredential = sdk.signInWithCredential;
    signUpWithCredential = sdk.signUpWithCredential;
    signOut = sdk.signOut;
} }));
let cloud: typeof import('./cloud');
const fetchMock = vi.fn();
beforeEach(async () => {
    vi.resetModules(); vi.resetAllMocks();
    vi.stubEnv('NEXT_PUBLIC_HEXCLAVE_PROJECT_ID', '');
    vi.stubEnv('NEXT_PUBLIC_HEXCLAVE_PUBLISHABLE_CLIENT_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_STACK_PROJECT_ID', 'project');
    vi.stubEnv('NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY', 'public');
    vi.stubGlobal('fetch', fetchMock);
    sdk.getUser.mockResolvedValue({ id: 'stack-a', primaryEmail: 'a@example.com' });
    sdk.getAuthorizationHeader.mockResolvedValue('Bearer stackauth_tokens');
    sdk.signInWithCredential.mockResolvedValue({ status: 'ok' });
    sdk.signUpWithCredential.mockResolvedValue({ status: 'ok' });
    fetchMock.mockImplementation(async () => Response.json({ state: { entries: [] }, revision: 3, updatedAt: 'today' }));
    cloud = await import('./cloud');
});

describe('Stack Auth client adapter and cloud requests', () => {
    it('accepts new Hexclave projects without a publishable client key', async () => {
        vi.stubEnv('NEXT_PUBLIC_STACK_PROJECT_ID', '');
        vi.stubEnv('NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY', '');
        vi.stubEnv('NEXT_PUBLIC_HEXCLAVE_PROJECT_ID', 'hexclave-project');
        expect(await cloud.getSession()).toEqual({ user: { id: 'stack-a', email: 'a@example.com' } });
        expect(sdk.constructor.mock.calls[0][0]).toMatchObject({ projectId: 'hexclave-project', publishableClientKey: undefined });
    });
    it('works locally with no keys and does not construct an SDK client', async () => {
        vi.stubEnv('NEXT_PUBLIC_STACK_PROJECT_ID', '');
        expect(cloud.getClient()).toBeNull();
        expect(await cloud.getSession()).toBeNull();
        expect(sdk.constructor).not.toHaveBeenCalled();
        await expect(cloud.loadCloud()).rejects.toThrow('not configured');
    });
    it('keeps local mode usable if the SDK rejects malformed configuration', async () => {
        sdk.constructor.mockImplementationOnce(() => { throw new Error('Invalid project ID'); });
        expect(cloud.getClient()).toBeNull();
        expect(await cloud.getSession()).toBeNull();
    });
    it('preserves the existing session shape without depending on provider components', async () => {
        expect(await cloud.getSession()).toEqual({ user: { id: 'stack-a', email: 'a@example.com' } });
        expect(sdk.constructor.mock.calls[0][0]).toMatchObject({ tokenStore: 'cookie', devTool: false, noAutomaticPrefetch: true, redirectMethod: 'none' });
        expect(sdk.constructor.mock.calls[0][0]).not.toHaveProperty('secretServerKey');
    });
    it('sends Stack authorization and expected owner, with private responses uncached', async () => {
        await cloud.loadCloud('stack-a');
        expect(fetchMock).toHaveBeenCalledWith('/api/sync', expect.objectContaining({ method: 'GET', cache: 'no-store', headers: expect.objectContaining({ Authorization: 'Bearer stackauth_tokens', 'X-Mori-Owner': 'stack-a' }) }));
        expect(cloud.getCloudRevision('stack-a')).toBe(3);
    });
    it('uses account-specific revisions and preserves an explicit null revision', async () => {
        await cloud.loadCloud('stack-a');
        await cloud.saveCloud({ words: 1 }, { userId: 'stack-a' });
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ state: { words: 1 }, expectedRevision: 3 });
        await cloud.saveCloud({}, { userId: 'stack-a', expectedRevision: null });
        expect(JSON.parse(fetchMock.mock.calls[2][1].body).expectedRevision).toBeNull();
        expect(cloud.getCloudRevision('stack-b')).toBeNull();
    });
    it('does not send data if the account changed', async () => {
        await expect(cloud.saveCloud({}, { userId: 'victim' })).rejects.toThrow('Account changed');
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('does not send data without a user or token', async () => {
        sdk.getUser.mockResolvedValue(null);
        await expect(cloud.loadCloud()).rejects.toThrow('Sign in');
        sdk.getUser.mockResolvedValue({ id: 'stack-a' }); sdk.getAuthorizationHeader.mockResolvedValue(null);
        await expect(cloud.loadCloud()).rejects.toThrow('Sign in');
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('returns null for an empty remote library', async () => {
        fetchMock.mockResolvedValue(Response.json({ state: null, revision: null }));
        expect(await cloud.loadCloud()).toBeNull();
    });
    it('retains the last good revision on conflict or network failure', async () => {
        await cloud.loadCloud();
        fetchMock.mockResolvedValue(Response.json({ error: 'Your cloud library changed' }, { status: 409 }));
        await expect(cloud.saveCloud({})).rejects.toThrow('cloud library changed');
        expect(cloud.getCloudRevision('stack-a')).toBe(3);
        fetchMock.mockRejectedValue(new TypeError('offline'));
        await expect(cloud.saveCloud({})).rejects.toThrow('offline');
        expect(cloud.getCloudRevision('stack-a')).toBe(3);
    });
    it('signs in through credentials without navigating and notifies the existing app', async () => {
        const listener = vi.fn(); const unsubscribe = cloud.onAuthStateChange(listener);
        await cloud.signIn('a@example.com', 'password');
        expect(sdk.signInWithCredential).toHaveBeenCalledWith({ email: 'a@example.com', password: 'password', noRedirect: true });
        expect(listener).toHaveBeenCalledWith('SIGNED_IN', { user: { id: 'stack-a', email: 'a@example.com' } });
        unsubscribe(); await cloud.signIn('a@example.com', 'password');
        expect(listener).toHaveBeenCalledTimes(1);
    });
    it('shows SDK credential errors and does not announce a successful sign in', async () => {
        const listener = vi.fn(); cloud.onAuthStateChange(listener);
        sdk.signInWithCredential.mockResolvedValue({ status: 'error', error: { humanReadableMessage: 'Wrong password' } });
        await expect(cloud.signIn('a@example.com', 'bad')).rejects.toThrow('Wrong password');
        expect(listener).not.toHaveBeenCalled();
    });
    it('supports both immediately active and email-restricted signups', async () => {
        expect(await cloud.signUp('a@example.com', 'password')).toBe(false);
        expect(sdk.signUpWithCredential).toHaveBeenCalledWith({ email: 'a@example.com', password: 'password', noRedirect: true });
        sdk.getUser.mockResolvedValue(null);
        expect(await cloud.signUp('a@example.com', 'password')).toBe(true);
    });
    it('shows signup errors and clears revisions only after successful sign out', async () => {
        await cloud.loadCloud();
        sdk.signUpWithCredential.mockResolvedValue({ status: 'error', error: { humanReadableMessage: 'Email already registered' } });
        await expect(cloud.signUp('a@example.com', 'password')).rejects.toThrow('Email already registered');
        const listener = vi.fn(); cloud.onAuthStateChange(listener);
        sdk.signOut.mockRejectedValueOnce(new Error('offline'));
        await expect(cloud.signOut()).rejects.toThrow('offline');
        expect(cloud.getCloudRevision('stack-a')).toBe(3);
        expect(listener).not.toHaveBeenCalled();
        await cloud.signOut();
        expect(cloud.getCloudRevision('stack-a')).toBeNull();
        expect(listener).toHaveBeenCalledWith('SIGNED_OUT', null);
    });
});
