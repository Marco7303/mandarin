import { z } from 'zod';

const id = z.string().min(1).max(160);
const text = z.string().max(20000);
// An explicit allowlist keeps account data, progress and future private fields
// out of public snapshots. IDs describe vocabulary only and are replaced on copy.
const sharedEntrySchema = z.object({
    id, setId: id,
    traditional: z.string().min(1).max(1000),
    english: text.min(1), pinyin: text.min(1),
    numbered: text.default(''),
    alignment: z.array(z.object({ character: z.string().max(100), pinyin: z.string().max(1000) })).max(1000).default([]),
    alignmentReview: z.boolean().default(false),
    notes: text.default(''),
    tags: z.array(z.string().max(200)).max(100).default([]),
    sourcePinyin: text.optional(), partOfSpeech: text.optional(),
    exampleTraditional: text.optional(), examplePinyin: text.optional(), exampleEnglish: text.optional(),
});
export const sharedDeckInputSchema = z.object({
    setId: id,
    name: z.string().trim().min(1).max(200),
    entries: z.preprocess(value => Array.isArray(value) ? value.filter(entry => !entry?.archived) : value,
        z.array(sharedEntrySchema).min(1, 'Add at least one word before sharing.').max(5000)),
}).superRefine((deck, ctx) => {
    if (deck.entries.some(entry => entry.setId !== deck.setId))
        ctx.addIssue({ code: 'custom', message: 'Only words from this set can be shared.' });
    if (new Set(deck.entries.map(entry => entry.id)).size !== deck.entries.length)
        ctx.addIssue({ code: 'custom', message: 'Duplicate word IDs are not allowed.' });
});
export const sharedDeckSchema = z.object({
    id: z.uuid(), name: z.string().min(1).max(200),
    entries: z.array(sharedEntrySchema).min(1).max(5000),
    updatedAt: z.iso.datetime(),
});
export type SharedDeckInput = z.infer<typeof sharedDeckInputSchema>;
export type SharedDeck = z.infer<typeof sharedDeckSchema>;
export const MAX_SHARE_BYTES = 2 * 1024 * 1024;
