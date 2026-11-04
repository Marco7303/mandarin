import { test, expect, type Page } from '@playwright/test';

// These tests use the real Stack browser SDK against controlled HTTP fixtures.
// No real credentials, accounts, emails, or hosted data are used.
async function installCloudFixture(page: Page) {
    let email = 'a@example.com', restricted = false;
    const libraries = new Map<string, { state: Record<string, unknown>; revision: number; updatedAt: string }>();
    let failWrites = false;
    const unexpected: string[] = [];
    const token = () => {
        const now = Math.floor(Date.now() / 1000);
        const payload = { sub: email, exp: now + 3600, iat: now, iss: 'fixture', aud: 'ffffffff-ffff-4fff-8fff-ffffffffffff', project_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', branch_id: 'main', refresh_token_id: 'fixture', role: 'authenticated', name: null, email, email_verified: !restricted, selected_team_id: null, signed_up_at: now, is_anonymous: false, is_restricted: restricted, restricted_reason: restricted ? { type: 'email_not_verified' } : null, requires_totp_mfa: false };
        return `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fixture`;
    };
    await page.route('https://**/*', async route => {
        const url = new URL(route.request().url());
        const respond = (json: unknown, status = 200, extraHeaders = {}) => route.fulfill({ status, json, headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*', ...extraHeaders } });
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
        if (url.pathname.endsWith('/internal/backend-urls')) return respond({});
        if (url.pathname.endsWith('/projects/current')) return respond({ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', config: { allow_localhost: true, domains: [{ domain: 'http://localhost:3000' }] } });
        if (url.pathname.endsWith('/auth/password/sign-in') || url.pathname.endsWith('/auth/password/sign-up')) {
            const body = route.request().postDataJSON();
            if (body.password === 'wrongpass') return respond({ code: 'EMAIL_PASSWORD_MISMATCH', message: 'Wrong e-mail or password.', details: {} }, 400, { 'x-hexclave-known-error': 'EMAIL_PASSWORD_MISMATCH' });
            email = body.email;
            return respond({ access_token: token(), refresh_token: `refresh-${email}` });
        }
        if (url.pathname.endsWith('/users/me') && !route.request().headers()['x-hexclave-access-token']) return respond({ code: 'CANNOT_GET_OWN_USER_WITHOUT_USER', message: 'No user', details: {} }, 400, { 'x-hexclave-known-error': 'CANNOT_GET_OWN_USER_WITHOUT_USER' });
        if (url.pathname.endsWith('/users/me')) return respond({
            id: email, primary_email: email, primary_email_verified: !restricted,
            display_name: null, selected_team_id: null, selected_team: null,
            profile_image_url: null, signed_up_at_millis: Date.now(), has_password: true,
            otp_auth_enabled: false, passkey_auth_enabled: false, client_metadata: null,
            client_read_only_metadata: null, is_anonymous: false, is_restricted: restricted,
            restricted_reason: restricted ? { type: 'email_not_verified' } : null,
            restricted_by_admin: false, restricted_by_admin_reason: null,
            oauth_providers: [], auth_with_email: true, requires_totp_mfa: false,
        });
        if (url.pathname.endsWith('/auth/sessions/current')) return respond({});
        unexpected.push(`${route.request().method()} ${url.pathname}`);
        return respond({});
    });
    await page.route('**/api/sync', async route => {
        const owner = route.request().headers()['x-mori-owner'];
        if (!owner || !route.request().headers().authorization?.startsWith('Bearer stackauth_')) return route.fulfill({ status: 401, json: { error: 'Sign in' } });
        const current = libraries.get(owner);
        if (route.request().method() === 'GET') return route.fulfill({ json: current || { state: null, revision: null } });
        if (failWrites) return route.fulfill({ status: 503, json: { error: 'Temporary database outage' } });
        const body = route.request().postDataJSON();
        if (body.expectedRevision !== (current?.revision ?? null)) return route.fulfill({ status: 409, json: { error: 'Your cloud library changed on another device.' } });
        const saved = { state: body.state, revision: (current?.revision ?? 0) + 1, updatedAt: new Date().toISOString() };
        libraries.set(owner, saved);
        return route.fulfill({ json: { revision: saved.revision, updatedAt: saved.updatedAt } });
    });
    return { libraries, unexpected, setFailWrites(value: boolean) { failWrites = value; }, setRestricted(value: boolean) { restricted = value; } };
}
async function openSignIn(page: Page) {
    await page.getByRole('button', { name: 'Your quiet corner' }).click();
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
}
async function signIn(page: Page, email: string, password = 'password123') {
    await openSignIn(page);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
}
async function settings(page: Page) { await page.getByRole('button', { name: 'Settings', exact: false }).first().click(); }

test('existing sign-in form, SDK cookies, account isolation, cloud review and sign out', async ({ page }) => {
    const fixture = await installCloudFixture(page);
    await page.goto('/');
    await signIn(page, 'a@example.com');
    await expect.poll(() => fixture.libraries.get('a@example.com')?.revision).toBe(1);
    expect((fixture.libraries.get('a@example.com')!.state.entries as unknown[]).length).toBe(55);
    await page.getByRole('button', { name: 'Let’s study' }).click();
    await page.getByRole('button', { name: 'Start studying' }).click();
    await page.keyboard.press('Space'); await page.keyboard.press('ArrowRight');
    await expect.poll(() => Object.keys(fixture.libraries.get('a@example.com')?.state.progress as object || {}).length).toBe(1);
    await page.reload();
    await settings(page);
    await expect(page.getByText('a@example.com', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Your quiet corner' })).toBeVisible();
    expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('mori-v2:guest')!).state.progress).length)).toBe(0);
    await page.getByRole('button', { name: 'Home', exact: false }).first().click();
    await signIn(page, 'b@example.com');
    await expect.poll(() => fixture.libraries.get('b@example.com')?.revision).toBe(1);
    expect(fixture.libraries.get('b@example.com')!.state.progress).toEqual({});
    expect(fixture.unexpected).toEqual([]);
});

test('wrong credentials stay in the unchanged form with a readable error', async ({ page }) => {
    await installCloudFixture(page); await page.goto('/');
    await signIn(page, 'a@example.com', 'wrongpass');
    await expect(page.locator('.form-error')).toContainText(/password/i);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true }).last()).toBeEnabled();
});

test('signup uses the existing form and seeds an active account from Excel', async ({ page }) => {
    const fixture = await installCloudFixture(page); await page.goto('/'); await openSignIn(page);
    await page.getByLabel('Email', { exact: true }).fill('new@example.com');
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect.poll(() => fixture.libraries.get('new@example.com')?.revision).toBe(1);
    expect(fixture.unexpected).toEqual([]);
});

test('pending reviews survive a database outage and retry without duplication', async ({ page }) => {
    const fixture = await installCloudFixture(page); await page.goto('/'); await signIn(page, 'a@example.com');
    await expect.poll(() => fixture.libraries.get('a@example.com')?.revision).toBe(1);
    fixture.setFailWrites(true);
    await page.getByRole('button', { name: 'Let’s study' }).click(); await page.getByRole('button', { name: 'Start studying' }).click();
    await page.keyboard.press('Space'); await page.keyboard.press('ArrowRight');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mori-v2:a@example.com')!).pending)).toBe(true);
    await page.reload(); await settings(page);
    await expect(page.locator('#main-content').getByText('Saved locally · sync pending', { exact: true })).toBeVisible();
    fixture.setFailWrites(false);
    await page.getByRole('button', { name: 'Sync now', exact: true }).click();
    await expect(page.locator('#main-content').getByText('Synced', { exact: true })).toBeVisible();
    expect(Object.keys(fixture.libraries.get('a@example.com')!.state.progress as object)).toHaveLength(1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mori-v2:a@example.com')!).pending)).toBe(false);
});

test('email-restricted signup stays local until verification', async ({ page }) => {
    const fixture = await installCloudFixture(page); fixture.setRestricted(true);
    await page.goto('/'); await openSignIn(page);
    await page.getByLabel('Email', { exact: true }).fill('verify@example.com');
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByText('Check your email to confirm your account.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Your quiet corner' })).toBeVisible();
    expect(fixture.libraries.size).toBe(0);
    expect(fixture.unexpected).toEqual([]);
});

for (const keepDevice of [true, false]) test(`cloud conflict can ${keepDevice ? 'keep this device' : 'use the cloud copy'}`, async ({ page }) => {
    const fixture = await installCloudFixture(page); await page.goto('/'); await signIn(page, 'a@example.com');
    await expect.poll(() => fixture.libraries.get('a@example.com')?.revision).toBe(1);
    const cloud = fixture.libraries.get('a@example.com')!;
    cloud.revision = 2;
    cloud.state.stars = { 'unit-1-1:english': true };
    await page.getByRole('button', { name: 'Let’s study' }).click(); await page.getByRole('button', { name: 'Start studying' }).click();
    await page.keyboard.press('Space'); await page.keyboard.press('ArrowRight');
    await settings(page);
    await expect(page.getByRole('button', { name: 'Keep this device', exact: true })).toBeVisible();
    await page.getByRole('button', { name: keepDevice ? 'Keep this device' : 'Use cloud copy', exact: true }).click();
    await expect(page.locator('#main-content').getByText('Synced', { exact: true })).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mori-v2:a@example.com')!));
    expect(stored.pending).toBe(false);
    expect(Object.keys(stored.state.progress)).toHaveLength(keepDevice ? 1 : 0);
    expect(stored.state.stars['unit-1-1:english']).toBe(keepDevice ? undefined : true);
    expect(fixture.libraries.get('a@example.com')!.revision).toBe(keepDevice ? 3 : 2);
});
