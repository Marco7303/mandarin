import type { Page } from '@playwright/test';
import seed from '../src/data/unit1.json';

// Existing-library scenarios explicitly supply their vocabulary; production starts empty.
export async function installExistingLibrary(page: Page, owners = ['guest']) {
    await page.addInitScript(({ entries, owners }) => {
        for (const owner of owners) {
            const key = `mori-v2:${owner}`;
            if (localStorage.getItem(key)) continue;
            localStorage.setItem(key, JSON.stringify({ state: {
                folders: [{ id: 'mandarin-class', name: 'Mandarin Class' }],
                sets: [{ id: 'unit-1', folderId: 'mandarin-class', name: 'Unit 1' }],
                entries, progress: {}, stars: {},
                preferences: { prompt: 'chinese', filter: 'Learning', order: 'Original', amount: '20' },
            }, pending: false, baseRevision: null }));
        }
    }, { entries: seed, owners });
}
