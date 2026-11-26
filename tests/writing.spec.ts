import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
test.use({ serviceWorkers: 'block' });
test.setTimeout(60000);

import { CHARACTER_DATA_VERSION } from '../src/lib/character-data-version';

async function library(page: Page, words = ['一']) {
    await page.addInitScript(words => {
        localStorage.setItem('mori-v2:guest', JSON.stringify({ state: {
            folders: [{ id: 'f', name: 'Writing tests' }], sets: [{ id: 's', folderId: 'f', name: 'Writing set' }],
            entries: words.map((traditional, i) => ({ id: String(i), setId: 's', traditional, pinyin: `pinyin ${i}`, english: `word ${i}`, numbered: '', notes: '', tags: [], alignment: [], alignmentReview: false })),
            progress: {}, stars: {}, preferences: { prompt: 'chinese', filter: 'Learning', order: 'Original', amount: '20' },
        }, pending: false, baseRevision: null }));
    }, words);
    await page.goto('/');
    await page.getByRole('button', { name: 'Study cards', exact: true }).click();
    await page.getByRole('button', { name: 'Writing', exact: true }).click();
}
async function ready(page: Page) {
    await expect(page.locator('.writing-instructions')).toContainText('0 /');
    await expect(page.locator('.writing-target svg')).toBeVisible();
}
async function stroke(page: Page, character: string, index: number, backwards = false, touch = false) {
    const shard = (character.codePointAt(0)! >> 8).toString(16);
    const raw = JSON.parse(readFileSync(`public/character-data/${CHARACTER_DATA_VERSION}/strokes/${shard}.json`, 'utf8'));
    let median: number[][] = raw.characters[character].medians[index];
    if (backwards) median = [...median].reverse();
    const board = page.locator('.writing-target svg');
    const rect = (await board.boundingBox())!;
    const scale = (rect.width - 44) / 1024;
    const points = median.map(([x, y]) => ({ x: rect.x + 22 + x * scale, y: rect.y + 22 + (900 - y) * scale }));
    if (touch) {
        await board.evaluate((svg, points) => {
            function send(type: string, point: {x:number;y:number}) {
                const finger = new Touch({ identifier: 1, target: svg, clientX: point.x, clientY: point.y });
                svg.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [finger], targetTouches: type === 'touchend' ? [] : [finger], changedTouches: [finger] }));
            }
            send('touchstart', points[0]);
            for (const point of points.slice(1)) send('touchmove', point);
            send('touchend', points[points.length - 1]);
        }, points);
    } else {
        await page.mouse.move(points[0].x, points[0].y);
        await page.mouse.down();
        for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, { steps: 2 });
        await page.mouse.up();
    }
}

test('writing rejects reversed and out-of-order strokes; accepts complete characters without changing flashcards', async ({ page }) => {
    test.setTimeout(60000);
    await library(page, ['二']);
    await page.getByRole('button', { name: 'Recall', exact: true }).click();
    await page.getByRole('button', { name: 'Start writing', exact: true }).click();
    await ready(page);
    await expect(page.locator('.writing-word')).toHaveCount(0);
    await stroke(page, '二', 1);
    await expect(page.locator('.writing-feedback')).toContainText('Try again');
    await expect(page.locator('.writing-instructions')).toContainText('0 / 2');
    await stroke(page, '二', 0, true);
    await expect(page.locator('.writing-instructions')).toContainText('0 / 2');
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    await stroke(page, '二', 0);
    await expect(page.locator('.writing-instructions')).toContainText('1 / 2');
    await stroke(page, '二', 1);
    await expect(page.locator('.writing-feedback')).toContainText('Character complete');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Writing complete' })).toBeVisible();
    await expect(page.locator('.result-stats')).toContainText('1Completed0With guidance0Skipped');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mori-v2:guest')!).state.progress)).toEqual({});
});

test('phone touch drawing, repeated characters, hint, retry, demonstration and summary', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await library(page, ['一一']);
    await page.getByRole('button', { name: 'Start writing', exact: true }).click();
    await ready(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '/tmp/mori-writing-phone.png', fullPage: true });
    await page.getByRole('button', { name: 'Hint', exact: true }).click();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await ready(page);
    await page.getByRole('button', { name: 'Stroke order', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled();
    await stroke(page, '一', 0, false, true);
    await expect(page.locator('.writing-feedback')).toContainText('Character complete');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.writing-prompt')).toContainText('Character 2 of 2');
    await ready(page);
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(page.locator('.result-stats')).toContainText('1Completed1With guidance1Skipped');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Study options' })).toBeVisible();
});

test('shuffles only selected twenty words and refresh returns safely to setup', async ({ page }) => {
    await library(page, Array.from({ length: 25 }, () => '一'));
    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await page.getByRole('combobox', { name: /ORDER/ }).selectOption('Shuffle');
    await page.evaluate(() => { Math.random = () => 0; });
    await page.getByRole('button', { name: 'Start writing', exact: true }).click();
    await ready(page);
    await expect(page.locator('.writing-prompt h1')).toHaveText('word 1');
    const seen = [];
    for (let i = 0; i < 20; i++) {
        seen.push(await page.locator('.writing-prompt h1').innerText());
        await page.getByRole('button', { name: 'Skip', exact: true }).click();
    }
    expect(seen.sort()).toEqual(Array.from({ length: 20 }, (_, i) => `word ${i}`).sort());
    await expect(page.getByRole('heading', { name: 'Writing complete' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Study options' })).toBeVisible();
});

test('missing data, network errors and retry do not block skipping', async ({ page }) => {
    await page.route('**/character-data/**/strokes/*.json', route => route.abort());
    await library(page);
    await page.getByRole('button', { name: 'Start writing', exact: true }).click();
    await expect(page.locator('.writing-feedback')).toContainText('could not load');
    await page.unroute('**/character-data/**/strokes/*.json');
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await ready(page);
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Writing complete' })).toBeVisible();
});

test('unsupported characters can be skipped', async ({ page }) => {
    await page.route('**/character-data/**/strokes/*.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"characters":{}}' }));
    await library(page);
    await page.getByRole('button', { name: 'Start writing', exact: true }).click();
    await expect(page.locator('.writing-feedback')).toContainText('No stroke data');
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Writing complete' })).toBeVisible();
});

test('a warmed writing batch works offline', async ({ page, context }) => {
    await library(page);
    await page.getByRole('button', { name: 'Recall', exact: true }).click();
    await page.getByRole('button', { name: 'Start writing', exact: true }).click();
    await ready(page);
    await context.setOffline(true);
    try {
        await page.getByRole('button', { name: 'Show character', exact: true }).click();
        await expect(page.locator('.writing-answer')).toHaveText('一');
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
        await ready(page);
        await stroke(page, '一', 0);
        await expect(page.locator('.writing-feedback')).toContainText('Character complete');
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(page.locator('.result-stats')).toContainText('1Completed1With guidance0Skipped');
    } finally { await context.setOffline(false); }
});


test('complex traditional characters accept all reference strokes', async ({ page }) => {
    await library(page, ['謝']);
    await page.getByRole('button', { name: 'Start writing', exact: true }).click();
    await ready(page);
    const raw = JSON.parse(readFileSync(`public/character-data/${CHARACTER_DATA_VERSION}/strokes/8b.json`, 'utf8'));
    const count = raw.characters['謝'].medians.length;
    for (let i = 0; i < count; i++) {
        await stroke(page, '謝', i, false, true);
        await expect(page.locator('.writing-instructions')).toContainText(`${i + 1} / ${count}`);
    }
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
});
