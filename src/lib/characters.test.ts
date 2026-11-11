import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import seed from '@/data/unit1.json';
import { CHARACTER_DATA_ROOT, characterShard, characterSource, charactersIn, type CharacterDetail, type CharacterStrokes } from './characters';

function bundled<T>(kind: string, char: string): T | undefined {
    const file = path.join(process.cwd(), 'public', CHARACTER_DATA_ROOT, kind, `${characterShard(char)}.json`);
    return JSON.parse(fs.readFileSync(file, 'utf8')).characters[char];
}
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('bundled character reference', () => {
    it('uses exact traditional characters and documented component roles', () => {
        const thanks = bundled<CharacterDetail>('details', '謝')!;
        expect(thanks.verified).toBe(true);
        expect(thanks.components.map(p => [p.character, p.roles])).toEqual([['言', ['meaning']], ['射', ['sound']]]);
        expect(thanks.words.some(w => w.traditional === '謝謝')).toBe(true);
        expect(thanks.words.every(w => w.traditional.includes('謝') && !w.traditional.includes('谢'))).toBe(true);
        expect(bundled<CharacterDetail>('details', '學')!.character).toBe('學');
        expect(bundled<CharacterDetail>('details', '学')!.character).toBe('学');
    });
    it('covers every starter character with verified explanations and stroke data', () => {
        for (const char of charactersIn(seed.map(e => e.traditional).join(''))) {
            const detail = bundled<CharacterDetail>('details', char)!;
            expect(detail?.verified, char).toBe(true);
            expect(detail?.hasStrokes, char).toBe(true);
            const drawing = bundled<CharacterStrokes>('strokes', char)!;
            expect(drawing.strokes.length, char).toBeGreaterThan(0);
            expect(drawing.medians.length, char).toBe(drawing.strokes.length);
        }
    });
    it('never exposes unverified etymologies or mismatched common words in any shard', () => {
        const dir = path.join(process.cwd(), 'public', CHARACTER_DATA_ROOT, 'details');
        for (const file of fs.readdirSync(dir)) {
            const rows = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')).characters as Record<string, CharacterDetail>;
            for (const [char, row] of Object.entries(rows)) {
                expect(row.character).toBe(char);
                if (!row.verified) { expect(row.hint).toBe(''); expect(row.components).toEqual([]); expect(row.history).toEqual([]); }
                expect(row.words.every(word => word.traditional.includes(char))).toBe(true);
                expect(row.history.every(form => form.url.startsWith('https://data.dong-chinese.com/'))).toBe(true);
            }
        }
    });
    it('handles repeated characters, punctuation and supplementary Han codepoints', () => {
        expect(charactersIn('謝謝，𠮷 A')).toEqual(['謝', '𠮷']);
        expect(characterShard('𠮷')).toBe('20b');
        expect(() => characterShard('../')).toThrow();
        expect(() => characterShard('AB')).toThrow();
        expect(characterSource('謝')).toBe('https://www.dong-chinese.com/wiki/%E8%AC%9D');
    });
});

describe('offline reference loading', () => {
    it('keeps public shards offline across a fresh module load and shares concurrent requests', async () => {
        const storage = new Map<string, Response>();
        vi.stubGlobal('caches', { open: async () => ({ match: async (key: string) => storage.get(key)?.clone(), put: async (key: string, response: Response) => { storage.set(key, response); } }) });
        const fetcher = vi.fn(async () => new Response(JSON.stringify({characters:{'謝':{character:'謝'}}})));
        vi.stubGlobal('fetch', fetcher);
        const first = await import('./characters');
        const results = await Promise.all([first.loadCharacter('謝'), first.loadCharacter('謝')]);
        expect(results[0]?.character).toBe('謝'); expect(fetcher).toHaveBeenCalledTimes(1);
        vi.resetModules();
        fetcher.mockRejectedValue(new Error('Offline'));
        const offline = await import('./characters');
        expect((await offline.loadCharacter('謝'))?.character).toBe('謝');
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it('allows retry after network failure and handles unavailable entries', async () => {
        const fetcher = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(new Response(JSON.stringify({characters:{}})));
        vi.stubGlobal('fetch', fetcher);
        const lib = await import('./characters');
        await expect(lib.loadCharacter('謝')).rejects.toThrow('Offline');
        expect(await lib.loadCharacter('謝')).toBeNull();
        expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it('still works online when CacheStorage is denied', async () => {
        vi.stubGlobal('caches', {open: async () => { throw new Error('Storage disabled'); }});
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({characters:{'口':{character:'口'}}}))));
        const lib = await import('./characters');
        expect((await lib.loadCharacter('口'))?.character).toBe('口');
    });
});
