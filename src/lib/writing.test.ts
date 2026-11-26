import { describe, expect, it, vi } from 'vitest';
import { makeEntry } from './core';
import { buildWritingQueue, writingCharacters } from './writing';

const entries = Array.from({ length: 25 }, (_, i) => makeEntry({ id: String(i), traditional: '一', pinyin: 'yī', english: `word ${i}` }));
describe('writing batches', () => {
    it('keeps repeated traditional characters and ignores punctuation', () => {
        expect(writingCharacters('謝謝，你！A1')).toEqual(['謝', '謝', '你']);
    });
    it('chooses the first twenty eligible words before shuffling', () => {
        const random = vi.spyOn(Math, 'random').mockReturnValue(0);
        try {
            const batch = buildWritingQueue(entries, {}, { starred: false, amount: 20, shuffle: true });
            expect(batch[0].id).toBe('1');
            expect(batch.map(e => e.id).sort()).toEqual(entries.slice(0, 20).map(e => e.id).sort());
            expect(entries[0].id).toBe('0');
        } finally { random.mockRestore(); }
    });
    it('uses stars from any front and excludes archived/non-Chinese words', () => {
        expect(buildWritingQueue([...entries, { ...entries[0], id: 'archived', archived: true }, { ...entries[0], id: 'latin', traditional: 'abc' }], { '1:pinyin': true, 'archived:english': true, 'latin:chinese': true }, { starred: true, amount: 'all', shuffle: false }).map(e => e.id)).toEqual(['1']);
    });
});
