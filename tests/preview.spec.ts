import { test, expect } from '@playwright/test';
import { installExistingLibrary } from './library-fixture';

test('empty writing preview gets a persistent sample and can immediately practise', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.set-open')).toContainText('Writing practice · sample set');
    await page.getByRole('button', { name: 'Study cards', exact: true }).click();
    await page.getByRole('button', { name: 'Writing', exact: true }).click();
    await page.getByRole('button', { name: 'Start writing', exact: true }).click();
    await expect(page.locator('.writing-instructions')).toContainText('0 / 1 strokes');
    await expect(page.locator('.writing-prompt h1')).toHaveText('one');
    await page.reload();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mori-v2:guest')!).state);
    expect(saved.entries).toHaveLength(20); expect(saved.sets).toHaveLength(1); expect(saved.folders).toHaveLength(1);
});

test('a previously saved empty preview library also receives the sample', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mori-v2:guest', JSON.stringify({ state: { folders: [], sets: [], entries: [], progress: {}, stars: {} }, pending: false, baseRevision: null })));
    await page.goto('/');
    await expect(page.locator('.set-open')).toContainText('Writing practice · sample set');
});

test('existing preview vocabulary is preserved without adding samples', async ({ page }) => {
    await installExistingLibrary(page);
    await page.goto('/');
    await expect(page.locator('.set-open')).toHaveCount(1);
    await expect(page.locator('.set-open')).toContainText('Unit 1');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mori-v2:guest')!).state);
    expect(saved.entries).toHaveLength(55);
    expect(saved.entries.some((entry: {id: string}) => entry.id.startsWith('writing-preview-sample'))).toBe(false);
});


test('an empty saved study view selects the newly added sample', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('mori-v2:guest', JSON.stringify({ state: { folders: [], sets: [], entries: [], progress: {}, stars: {} }, pending: false, baseRevision: null }));
        sessionStorage.setItem('mori-view:guest', JSON.stringify({ screen: 'setup', selectedSets: [] }));
    });
    await page.goto('/');
    await expect(page.locator('#study-set')).toHaveValue('writing-preview-sample');
    await page.getByRole('button', { name: 'Writing', exact: true }).click();
    await page.getByRole('button', { name: 'Start writing', exact: true }).click();
    await expect(page.locator('.writing-instructions')).toContainText('0 / 1 strokes');
});
