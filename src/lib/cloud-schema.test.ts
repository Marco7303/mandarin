import { describe, expect, it } from 'vitest';
import { snapshotSchema } from './cloud-schema';
import { recordAnswer } from './core';
const state = { folders: [{ id: 'f', name: 'Class' }], sets: [{ id: 's', name: 'Unit 1', folderId: 'f' }], entries: [{ id: 'e', setId: 's', traditional: '學生', english: 'student', pinyin: 'xuéshēng' }], progress: {}, stars: {} };
describe('cloud validation', () => {
    it('accepts new progress without review dates and legacy progress with them', () => {
        const progress = recordAnswer(undefined, true);
        expect(snapshotSchema.safeParse({ ...state, progress: { 'e:chinese': progress } }).success).toBe(true);
        expect(snapshotSchema.safeParse({ ...state, progress: { 'e:chinese': { ...progress, nextReview: '2000-01-01T00:00:00.000Z' } } }).success).toBe(true);
    });
    it('accepts a complete owned library snapshot', () => expect(snapshotSchema.safeParse(state).success).toBe(true));
    it('rejects broken folder ownership links', () => expect(snapshotSchema.safeParse({ ...state, folders: [] }).success).toBe(false));
    it('rejects duplicate entry identities', () => expect(snapshotSchema.safeParse({ ...state, entries: [...state.entries, ...state.entries] }).success).toBe(false));
    it('rejects mixed as a fourth star dimension', () => expect(snapshotSchema.safeParse({ ...state, stars: { 'e:mixed': true } }).success).toBe(false));
    it('rejects progress attached to missing entries', () => expect(snapshotSchema.safeParse({ ...state, stars: { 'missing:english': true } }).success).toBe(false));
    it('keeps stars independent for each front', () => expect(snapshotSchema.parse({ ...state, stars: { 'e:english': true } }).stars).toEqual({ 'e:english': true }));
});
