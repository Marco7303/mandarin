import { test, expect, type Page } from '@playwright/test';
import type { SharedDeck } from '../src/lib/sharing-schema';
import seed from '../src/data/unit1.json';

// Keep HTTP fixtures in Playwright's routing layer. The separate app suite
// exercises the real service worker and offline storage.
test.use({ serviceWorkers: 'block' });

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
    await page.route('**/api/community/profile', route => route.fulfill({ json: { displayName: '' } }));
    return { libraries, unexpected, setFailWrites(value: boolean) { failWrites = value; }, setRestricted(value: boolean) { restricted = value; } };
}
async function openSignIn(page: Page) {
    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
}
async function signIn(page: Page, email: string, password = 'password123') {
    await openSignIn(page);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
}
async function settings(page: Page) { await page.getByRole('button', { name: 'Settings', exact: false }).first().click(); }

test('public publishing lets an existing account choose a name, update visibility and keep all personal data', async ({ page }) => {
    const fixture = await installCloudFixture(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // This account predates public profiles and already has its own library and progress.
    const state = {
        folders: [{ id: 'mandarin-class', name: 'Mandarin Class' }],
        sets: [{ id: 'unit-1', folderId: 'mandarin-class', name: 'Existing account set' }],
        entries: seed, stars: {},
        progress: { [`${seed[0].id}:chinese`]: { reviewCount: 1, correctCount: 1, incorrectCount: 0, consecutiveCorrect: 1, stage: 1, lastResult: 'know', lastReviewed: '2026-11-10T12:00:00.000Z' } },
        preferences: { prompt: 'chinese', filter: 'Learning', order: 'Original', amount: '20' },
    };
    fixture.libraries.set('existing@example.com', { state, revision: 7, updatedAt: '2026-11-10T12:00:00.000Z' });
    let share: SharedDeck | null = null, publicName = '';
    const writes: Record<string, unknown>[] = [];
    await page.route('**/api/community/profile', route => route.fulfill({ json: { displayName: publicName } }));
    await page.route('**/api/shares**', route => {
        if (route.request().method() === 'GET') return route.fulfill({ json: { share } });
        if (route.request().method() === 'DELETE') { share = null; return route.fulfill({ json: { success: true } }); }
        const body = route.request().postDataJSON(); writes.push(body); publicName = body.creatorName || publicName;
        share = { ...body, id: 'a3278291-32e0-4dbb-bbcb-013968d04c98', updatedAt: new Date().toISOString(), suppressed: false };
        return route.fulfill({ json: share });
    });
    await signIn(page, 'existing@example.com');
    await expect(page.locator('.set-open').first()).toContainText('Existing account set');
    const before = JSON.stringify(fixture.libraries.get('existing@example.com'));
    await page.locator('.set-open').first().click();
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('radio', { name: /Anyone with the link/ })).toBeChecked();
    await dialog.getByRole('radio', { name: /^Public/ }).check();
    await expect(dialog.getByRole('textbox', { name: 'Public name', exact: true })).toHaveValue('');
    await expect(dialog.getByRole('button', { name: 'Publish set', exact: true })).toBeDisabled();
    await dialog.getByRole('textbox', { name: 'Public name', exact: true }).fill('Taiwan learner');
    await dialog.getByRole('textbox', { name: 'Set description', exact: true }).fill('Everyday class vocabulary');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'test-results/publish-mobile.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await dialog.getByRole('button', { name: 'Publish set', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('Published in Explore.');
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ isPublic: true, creatorName: 'Taiwan learner', description: 'Everyday class vocabulary' });
    expect(JSON.stringify(writes)).not.toContain('existing@example.com');
    expect(writes[0]).not.toHaveProperty('progress');
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(dialog.getByRole('radio', { name: /^Public/ })).toBeChecked();
    await expect(dialog.getByRole('textbox', { name: 'Public name', exact: true })).toHaveValue('Taiwan learner');
    await dialog.getByRole('radio', { name: /Anyone with the link/ }).check();
    await dialog.getByRole('button', { name: 'Save as unlisted', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Only people with the link');
    expect(writes[1].isPublic).toBe(false);
    await expect(dialog.getByLabel('Share link', { exact: true })).toHaveValue(/a3278291-32e0-4dbb-bbcb-013968d04c98$/);
    expect(JSON.stringify(fixture.libraries.get('existing@example.com'))).toBe(before);
    expect(fixture.unexpected).toEqual([]);
});

test('signed-in learners can report public sets without adding them or exposing account details', async ({ page }) => {
    const fixture = await installCloudFixture(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' }); await signIn(page, 'reporter@example.com');
    await expect(page.getByRole('button', { name: 'Account', exact: true })).toContainText('reporter');
    await expect.poll(() => fixture.libraries.get('reporter@example.com')?.revision).toBe(1);
    const before = JSON.stringify(fixture.libraries.get('reporter@example.com'));
    const id = 'a3278291-32e0-4dbb-bbcb-013968d04c98';
    await page.route(`**/api/shares/${id}`, route => route.fulfill({ json: {
        id, name: 'Public words', updatedAt: new Date().toISOString(), isPublic: true, creatorName: 'Learner',
        entries: [{ id: 'one', setId: 'source', traditional: '學', english: 'learn', pinyin: 'xué' }],
    } }));
    let report: unknown;
    await page.route(`**/api/community/${id}/report`, route => {
        expect(route.request().headers()['x-mori-owner']).toBe('reporter@example.com');
        expect(route.request().headers().authorization).toMatch(/^Bearer stackauth_/);
        report = route.request().postDataJSON(); return route.fulfill({ json: { success: true } });
    });
    await page.goto(`/share/${id}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Report this set', exact: true }).click();
    await page.getByRole('combobox', { name: 'Reason', exact: true }).selectOption('Inaccurate content');
    await page.getByLabel('Details optional').fill('Please check this pronunciation.');
    await page.getByRole('button', { name: 'Send report', exact: true }).click();
    await expect(page.getByText('Report received.', { exact: true })).toBeVisible();
    expect(report).toEqual({ reason: 'Inaccurate content', details: 'Please check this pronunciation.' });
    expect(JSON.stringify(fixture.libraries.get('reporter@example.com'))).toBe(before);
    expect(fixture.unexpected).toEqual([]);
});

test('existing sign-in form, SDK cookies, account isolation, cloud review and sign out', async ({ page }) => {
    const fixture = await installCloudFixture(page);
    await page.goto('/', {waitUntil:'domcontentloaded'});
    await signIn(page, 'a@example.com');
    await expect.poll(() => fixture.libraries.get('a@example.com')?.revision).toBe(1);
    expect((fixture.libraries.get('a@example.com')!.state.entries as unknown[]).length).toBe(55);
    await page.getByRole('button', { name: 'Study cards' }).click();
    await page.getByRole('button', { name: 'Start studying' }).click();
    await page.keyboard.press('Space'); await page.keyboard.press('ArrowRight');
    await expect.poll(() => Object.keys(fixture.libraries.get('a@example.com')?.state.progress as object || {}).length).toBe(1);
    await page.reload({waitUntil:'domcontentloaded'});
    await settings(page);
    await expect(page.getByText('a@example.com', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Account', exact: true })).toContainText('Not signed in');
    expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('mori-v2:guest')!).state.progress).length)).toBe(0);
    await page.getByRole('button', { name: 'Home', exact: false }).first().click();
    await signIn(page, 'b@example.com');
    await expect.poll(() => fixture.libraries.get('b@example.com')?.revision).toBe(1);
    expect(fixture.libraries.get('b@example.com')!.state.progress).toEqual({});
    expect(fixture.unexpected).toEqual([]);
});

test('wrong credentials stay in the unchanged form with a readable error', async ({ page }) => {
    await installCloudFixture(page); await page.goto('/', {waitUntil:'domcontentloaded'});
    await signIn(page, 'a@example.com', 'wrongpass');
    await expect(page.locator('.form-error')).toContainText(/password/i);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true }).last()).toBeEnabled();
});

test('signup uses the existing form and seeds an active account from Excel', async ({ page }) => {
    const fixture = await installCloudFixture(page); await page.goto('/', {waitUntil:'domcontentloaded'}); await openSignIn(page);
    await page.getByLabel('Email', { exact: true }).fill('new@example.com');
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByRole('dialog').getByRole('button', { name: 'Create account', exact: true }).click();
    await expect.poll(() => fixture.libraries.get('new@example.com')?.revision).toBe(1);
    expect(fixture.unexpected).toEqual([]);
});

test('pending reviews survive a database outage and retry without duplication', async ({ page }) => {
    const fixture = await installCloudFixture(page); await page.goto('/', {waitUntil:'domcontentloaded'}); await signIn(page, 'a@example.com');
    await expect.poll(() => fixture.libraries.get('a@example.com')?.revision).toBe(1);
    fixture.setFailWrites(true);
    await page.getByRole('button', { name: 'Study cards' }).click(); await page.getByRole('button', { name: 'Start studying' }).click();
    await page.keyboard.press('Space'); await page.keyboard.press('ArrowRight');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mori-v2:a@example.com')!).pending)).toBe(true);
    await page.reload({waitUntil:'domcontentloaded'}); await settings(page);
    await expect(page.locator('#main-content').getByText('Saved locally · sync pending', { exact: true })).toBeVisible();
    fixture.setFailWrites(false);
    await page.getByRole('button', { name: 'Sync now', exact: true }).click();
    await expect(page.locator('#main-content').getByText('Synced', { exact: true })).toBeVisible();
    expect(Object.keys(fixture.libraries.get('a@example.com')!.state.progress as object)).toHaveLength(1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mori-v2:a@example.com')!).pending)).toBe(false);
});

test('email-restricted signup stays local until verification', async ({ page }) => {
    const fixture = await installCloudFixture(page); fixture.setRestricted(true);
    await page.goto('/', {waitUntil:'domcontentloaded'});
    await page.getByRole('button', {name:'Create a study set',exact:true}).click();
    await page.getByRole('dialog').getByRole('button', {name:'Create account',exact:true}).click();
    await page.getByLabel('Email', { exact: true }).fill('verify@example.com');
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByRole('dialog').getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByText('Check your email to confirm your account.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Account', exact: true })).toContainText('Not signed in');
    expect(fixture.libraries.size).toBe(0);
    expect(fixture.unexpected).toEqual([]);
});

for (const keepDevice of [true, false]) test(`cloud conflict can ${keepDevice ? 'keep this device' : 'use the cloud copy'}`, async ({ page }) => {
    const fixture = await installCloudFixture(page); await page.goto('/', {waitUntil:'domcontentloaded'}); await signIn(page, 'a@example.com');
    await expect.poll(() => fixture.libraries.get('a@example.com')?.revision).toBe(1);
    const cloud = fixture.libraries.get('a@example.com')!;
    cloud.revision = 2;
    cloud.state.stars = { 'unit-1-1:english': true };
    await page.getByRole('button', { name: 'Study cards' }).click(); await page.getByRole('button', { name: 'Start studying' }).click();
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

test('legacy cloud progress becomes Learning and Learned, and reset syncs without deleting vocabulary or stars', async ({page}) => {
    const fixture = await installCloudFixture(page);
    await page.goto('/', {waitUntil:'domcontentloaded'}); await signIn(page, 'a@example.com');
    await expect.poll(() => fixture.libraries.get('a@example.com')?.revision).toBe(1);
    const cloud = fixture.libraries.get('a@example.com')!;
    const entries = (cloud.state.entries as {id:string}[]).slice(0,2);
    const known = { reviewCount:1, correctCount:1, incorrectCount:0, consecutiveCorrect:1, stage:1, lastResult:'know', lastReviewed:'2020-01-01T00:00:00.000Z', nextReview:'2020-01-03T00:00:00.000Z' };
    cloud.state.entries = entries;
    cloud.state.progress = { [entries[0].id+':chinese']: known };
    cloud.state.stars = { [entries[0].id+':chinese']: true };
    cloud.state.preferences = { prompt:'chinese', filter:'Due', order:'Review order', amount:'All' };
    cloud.revision++;
    await page.reload({waitUntil:'domcontentloaded'});
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mori-v2:a@example.com')!).baseRevision)).toBe(2);
    await page.getByRole('button',{name:'Study Unit 1',exact:true}).click();
    await expect(page.getByRole('button',{name:'Learning',exact:true})).toHaveClass(/selected/);
    await page.getByRole('button',{name:'Start studying'}).click();
    await expect(page.locator('.session-header')).toContainText('1 / 1');
    await page.keyboard.press('Space'); await page.keyboard.press('ArrowRight');
    await expect.poll(() => (fixture.libraries.get('a@example.com')!.state.progress as Record<string,{lastResult:string}>)[entries[1].id+':chinese']?.lastResult).toBe('know');
    expect((fixture.libraries.get('a@example.com')!.state.progress as Record<string,object>)[entries[1].id+':chinese']).not.toHaveProperty('nextReview');
    await page.getByRole('button',{name:'Done',exact:true}).click();
    await page.locator('.set-open').first().click();
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Reset progress',exact:true}).click();
    await expect.poll(() => Object.keys(fixture.libraries.get('a@example.com')!.state.progress as object).length).toBe(0);
    expect(fixture.libraries.get('a@example.com')!.state.entries).toHaveLength(2);
    expect(fixture.libraries.get('a@example.com')!.state.stars).toEqual({ [entries[0].id+':chinese']: true });
    expect(fixture.unexpected).toEqual([]);
});

test('guest account prompt resumes set creation after signup and saves the set online', async ({page}) => {
 const fixture=await installCloudFixture(page);await page.goto('/', {waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Create a study set',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('heading',{name:'Save sets to your account'})).toBeVisible();
 await expect(dialog).toContainText('Clearing browser data will delete it.');
 await dialog.getByRole('button',{name:'Create account',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Create account',exact:true})).toHaveClass(/primary/);
 await page.getByLabel('Email',{exact:true}).fill('new@example.com');
 await page.getByLabel('Password',{exact:true}).fill('password123');
 await dialog.getByRole('button',{name:'Create account',exact:true}).click();
 await expect(dialog.getByRole('heading',{name:'Create a study set',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Browser-only storage'})).toHaveCount(0);
 await page.getByLabel('Name',{exact:true}).fill('Account set');
 await dialog.getByRole('button',{name:'Create',exact:true}).click();
 await expect.poll(()=>(fixture.libraries.get('new@example.com')?.state.sets as {name:string}[]|undefined)?.some(s=>s.name==='Account set')).toBe(true);
 await page.getByRole('button',{name:'Home',exact:false}).first().click();
 await page.getByRole('button',{name:'Create a study set',exact:true}).click();
 await expect(dialog.getByRole('heading',{name:'Create a study set',exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Continue in this browser',exact:true})).toHaveCount(0);
 expect(fixture.unexpected).toEqual([]);
});

test('cancelling the account prompt cancels pending set creation', async ({page}) => {
 const fixture=await installCloudFixture(page);await page.goto('/', {waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Create a study set',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('button',{name:'Close dialog'}).click();
 await signIn(page,'a@example.com');
 await expect.poll(()=>fixture.libraries.get('a@example.com')?.revision).toBe(1);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Your study space'})).toBeVisible();
});

test('owners create, update and revoke a shared snapshot without publishing progress or other sets',async({page})=>{
 const fixture=await installCloudFixture(page);
 type Share={id:string;name:string;entries:Record<string,unknown>[];updatedAt:string};
 let share:Share|null=null;
 const writes:Record<string,unknown>[]=[];
 const requests:{method:string;owner:string|undefined;authorization:string|undefined}[]=[];
 await page.route('**/api/shares**',async route=>{
  const request=route.request();const url=new URL(request.url());
  requests.push({method:request.method(),owner:request.headers()['x-mori-owner'],authorization:request.headers().authorization});
  if(request.method()==='GET')return route.fulfill({json:{share}});
  if(request.method()==='DELETE'){share=null;return route.fulfill({json:{success:true}});}
  const body=request.postDataJSON();writes.push(body);
  share={id:'a3278291-32e0-4dbb-bbcb-013968d04c98',name:body.name,entries:body.entries,updatedAt:new Date().toISOString()};
  expect(url.pathname).toBe('/api/shares');
  return route.fulfill({json:share});
 });
 await page.goto('/', {waitUntil:'domcontentloaded'});await signIn(page,'a@example.com');
 await expect.poll(()=>fixture.libraries.get('a@example.com')?.revision).toBe(1);
 await page.locator('.set-open').first().click();
 await page.getByRole('button',{name:'Share',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('heading',{name:'Share set',exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'Create link',exact:true}).click();
 await expect(dialog.getByLabel('Share link',{exact:true})).toHaveValue(/\/share\/a3278291-32e0-4dbb-bbcb-013968d04c98$/);
 await expect(dialog.getByRole('button',{name:'Copy link',exact:true})).toBeVisible();
 expect(writes).toHaveLength(1);expect(writes[0].setId).toBe('unit-1');
 expect(writes[0].entries).toHaveLength(55);expect(writes[0]).not.toHaveProperty('progress');expect(writes[0]).not.toHaveProperty('stars');expect(writes[0]).not.toHaveProperty('folders');
 await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();
 // A later local edit is published only by explicitly updating the same link.
 await page.getByRole('button',{name:/^Edit /}).first().click();
 await page.getByLabel('English',{exact:true}).fill('Updated shared definition');
 await page.getByRole('button',{name:'Save word',exact:true}).click();
 await page.getByRole('button',{name:'Share',exact:true}).click();
 await expect(dialog.getByLabel('Share link',{exact:true})).toBeVisible();
 expect(writes).toHaveLength(1);
 await dialog.getByRole('button',{name:'Update shared version',exact:true}).click();
 await expect.poll(()=>writes.length).toBe(2);
 expect((writes[1].entries as {english:string}[])[0].english).toBe('Updated shared definition');
 await expect(dialog.getByLabel('Share link',{exact:true})).toHaveValue(/\/share\/a3278291-32e0-4dbb-bbcb-013968d04c98$/);
 page.once('dialog',confirmation=>confirmation.accept());
 await dialog.getByRole('button',{name:'Stop sharing',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Create link',exact:true})).toBeVisible();
 await expect(dialog.getByLabel('Share link',{exact:true})).toHaveCount(0);
 expect(share).toBeNull();
 expect(requests.every(r=>r.owner==='a@example.com'&&r.authorization?.startsWith('Bearer stackauth_'))).toBe(true);
 expect(requests.some(r=>r.method==='DELETE')).toBe(true);
 expect(fixture.unexpected).toEqual([]);
});

test('a signed-in recipient saves a shared copy online and keeps it after revocation',async({page})=>{
 const fixture=await installCloudFixture(page);
 const id='94ec3a6e-d77c-44f2-9697-6274e8bd6475';
 let revoked=false;
 await page.route(`**/api/shares/${id}`,route=>revoked?route.fulfill({status:404,json:{error:'Unavailable'}}):route.fulfill({json:{id,name:'Received vocabulary',updatedAt:new Date().toISOString(),entries:[{id:'public-word',setId:'someone-elses-set',traditional:'學校',english:'school',pinyin:'xuéxiào',numbered:'xue2 xiao4',alignment:[{character:'學',pinyin:'xué'},{character:'校',pinyin:'xiào'}],alignmentReview:false,notes:'Shared example',tags:[]}]}}));
 await page.goto('/', {waitUntil:'domcontentloaded'});await signIn(page,'recipient@example.com');
 await expect.poll(()=>fixture.libraries.get('recipient@example.com')?.revision).toBe(1);
 await page.goto(`/share/${id}`, {waitUntil:'domcontentloaded'});
 await expect(page.getByRole('button',{name:'Add to library',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Add to library',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Received vocabulary.',exact:true})).toBeVisible();
 await expect.poll(()=>(fixture.libraries.get('recipient@example.com')?.state.sets as {sourceShareId?:string}[]|undefined)?.some(s=>s.sourceShareId===id)).toBe(true);
 await page.getByRole('button',{name:'Study set',exact:true}).click();
 await page.getByRole('button',{name:'Start studying',exact:true}).click();
 await page.getByRole('button',{name:'Reveal answer',exact:true}).click();
 await page.getByRole('button',{name:'Know',exact:true}).click();
 await expect.poll(()=>Object.keys(fixture.libraries.get('recipient@example.com')?.state.progress as object||{}).length).toBe(1);
 const saved=fixture.libraries.get('recipient@example.com')!.state;
 const word=(saved.entries as {id:string;english:string}[]).find(e=>e.english==='school')!;
 expect(word.id).not.toBe('public-word');expect(saved.progress).not.toHaveProperty('public-word:chinese');
 revoked=true;await page.goto(`/share/${id}`, {waitUntil:'domcontentloaded'});
 await expect(page.getByRole('heading',{name:'Set unavailable',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Open your copy',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Received vocabulary.',exact:true})).toBeVisible();
 expect(Object.keys(fixture.libraries.get('recipient@example.com')!.state.progress as object)).toHaveLength(1);
 expect(fixture.unexpected).toEqual([]);
});
