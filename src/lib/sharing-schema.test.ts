import { describe, expect, it } from 'vitest';
import { sharedDeckInputSchema } from './sharing-schema';
import seed from '../data/unit1.json';

const deck = { setId: 'unit-1', name: ' Unit 1 ', entries: seed };
describe('public vocabulary allowlist', () => {
    it('requires explicit public opt-in and a chosen public name; old clients remain valid', () => {
        expect(sharedDeckInputSchema.parse(deck)).not.toHaveProperty('isPublic');
        for (const data of [{ isPublic: true }, { isPublic: true, creatorName: 'a' }, { isPublic: true, creatorName: 'private@example.com' }, { isPublic: 'true' }, { description: 'x'.repeat(501) }])
            expect(sharedDeckInputSchema.safeParse({ ...deck, ...data }).success).toBe(false);
        expect(sharedDeckInputSchema.parse({ ...deck, isPublic: true, creatorName: ' Learner ', description: ' Lesson 1 ' })).toMatchObject({ isPublic: true, creatorName: 'Learner', description: 'Lesson 1' });
    });
    it('retains vocabulary, alignment, notes and examples, strips private state and unknown fields', () => {
        const parsed = sharedDeckInputSchema.parse({ ...deck, ownerId: 'secret', stars: {}, progress: {}, entries: [{ ...seed[0], privateData: 'secret' }] });
        expect(parsed.name).toBe('Unit 1');
        expect(parsed.entries[0]).toEqual(seed[0]);
        expect(JSON.stringify(parsed)).not.toContain('secret');
    });
    it('excludes archived words and rejects an empty published set', () => {
        expect(sharedDeckInputSchema.parse({ ...deck, entries: [seed[0], { ...seed[1], archived: true }] }).entries).toHaveLength(1);
        expect(sharedDeckInputSchema.safeParse({ ...deck, entries: [] }).success).toBe(false);
    });
    it('rejects words from another set, duplicate IDs, oversized text and excessive entries', () => {
        for (const entries of [[{ ...seed[0], setId: 'other' }], [seed[0], seed[0]], [{ ...seed[0], notes: 'x'.repeat(20001) }], Array.from({ length: 5001 }, (_, i) => ({ ...seed[0], id: String(i) }))])
            expect(sharedDeckInputSchema.safeParse({ ...deck, entries }).success).toBe(false);
    });
});
