import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createPreviewSample, isWritingPreview, needsPreviewSample } from './preview-sample';
import { CHARACTER_DATA_VERSION } from './character-data-version';
import { writingCharacters } from './writing';

describe('preview sample library', () => {
    it('only enables the writing experiment preview, never production or other branches', () => {
        expect(isWritingPreview('preview', 'feature/writing-practice')).toBe(true);
        for (const env of ['production', 'development', undefined]) expect(isWritingPreview(env, 'feature/writing-practice')).toBe(false);
        expect(isWritingPreview('preview', 'main')).toBe(false);
        expect(isWritingPreview('preview')).toBe(false);
    });
    it('only fills empty guest libraries, including previously saved empty libraries', () => {
        expect(needsPreviewSample(true, 'guest', 0, 0)).toBe(true);
        expect(needsPreviewSample(false, 'guest', 0, 0)).toBe(false);
        expect(needsPreviewSample(true, 'account-user', 0, 0)).toBe(false);
        expect(needsPreviewSample(true, 'guest', 1, 0)).toBe(false);
        expect(needsPreviewSample(true, 'guest', 0, 1)).toBe(false);
    });
    it('provides twenty complete words with stroke data for every character', () => {
        const sample = createPreviewSample();
        expect(sample.entries).toHaveLength(20);
        expect(new Set(sample.entries.map(entry => entry.id)).size).toBe(20);
        expect(sample.set.folderId).toBe(sample.folder.id);
        for (const entry of sample.entries) {
            expect(entry.setId).toBe(sample.set.id);
            expect(entry.english).toBeTruthy(); expect(entry.pinyin).toBeTruthy();
            for (const char of writingCharacters(entry.traditional)) {
                const shard = (char.codePointAt(0)! >> 8).toString(16);
                const data = JSON.parse(readFileSync(`public/character-data/${CHARACTER_DATA_VERSION}/strokes/${shard}.json`, 'utf8'));
                expect(data.characters[char]?.medians.length).toBeGreaterThan(0);
            }
        }
    });
});
