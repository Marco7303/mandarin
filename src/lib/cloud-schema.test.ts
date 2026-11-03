import { describe, expect, it } from 'vitest';
import { snapshotSchema } from './cloud-schema';
const state = { folders: [{ id: 'f', name: 'Class' }], sets: [{ id: 's', name: 'Unit 1', folderId: 'f' }], entries: [{ id: 'e', setId: 's', traditional: '學生', english: 'student', pinyin: 'xuéshēng' }], progress: {}, stars: {} };
describe('cloud validation', () => {
    it('accepts a complete owned library snapshot', () => expect(snapshotSchema.safeParse(state).success).toBe(true));
    it('rejects broken folder ownership links', () => expect(snapshotSchema.safeParse({ ...state, folders: [] }).success).toBe(false));
    it('rejects duplicate entry identities', () => expect(snapshotSchema.safeParse({ ...state, entries: [...state.entries, ...state.entries] }).success).toBe(false));
    it('rejects mixed as a fourth star dimension', () => expect(snapshotSchema.safeParse({ ...state, stars: { 'e:mixed': true } }).success).toBe(false));
    it('rejects progress attached to missing entries', () => expect(snapshotSchema.safeParse({ ...state, stars: { 'missing:english': true } }).success).toBe(false));
    it('keeps stars independent for each front', () => expect(snapshotSchema.parse({ ...state, stars: { 'e:english': true } }).stars).toEqual({ 'e:english': true }));
});
