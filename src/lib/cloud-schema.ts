import { z } from 'zod';
const text = z.string().max(20000);
const id = z.string().min(1).max(160);
const folder = z.object({ id, name: z.string().min(1).max(200) }).passthrough();
const set = z.object({ id, name: z.string().min(1).max(200), folderId: id }).passthrough();
const count = z.number().int().min(0).max(100000000);
const progress = z.object({ reviewCount: count, correctCount: count, incorrectCount: count, consecutiveCorrect: count, stage: z.number().int().min(0).max(6), lastResult: z.enum(['know', 'learning']), lastReviewed: z.iso.datetime(), nextReview: z.iso.datetime() });
const promptKey = z.string().regex(/^.+:(chinese|pinyin|english)$/);
const entry = z.object({ id, setId: id, traditional: z.string().min(1).max(1000), english: text.min(1), pinyin: text.min(1) }).passthrough();
// Arrays and string sizes are bounded before this data reaches PostgreSQL. Additional
// fields allow an older client to preserve newer optional vocabulary metadata.
export const snapshotSchema = z.object({
    folders: z.array(folder).max(500),
    sets: z.array(set).max(2000),
    entries: z.array(entry).max(20000),
    progress: z.record(promptKey, progress),
    stars: z.record(promptKey, z.boolean()),
}).passthrough().superRefine((state, ctx) => {
    const folders = new Set(state.folders.map(x => x.id));
    const sets = new Set(state.sets.map(x => x.id));
    const entries = new Set(state.entries.map(x => x.id));
    if ([...Object.keys(state.progress), ...Object.keys(state.stars)].some(key => !entries.has(key.slice(0, key.lastIndexOf(':'))))) {
        ctx.addIssue({ code: 'custom', message: 'Progress belongs to a missing entry.' });
    }
    if (folders.size !== state.folders.length || sets.size !== state.sets.length || new Set(state.entries.map(x => x.id)).size !== state.entries.length) {
        ctx.addIssue({ code: 'custom', message: 'Duplicate IDs are not allowed.' });
    }
    if (state.sets.some(x => !folders.has(x.folderId)) || state.entries.some(x => !sets.has(x.setId))) {
        ctx.addIssue({ code: 'custom', message: 'A folder or set is missing.' });
    }
});
export type CloudSnapshot = z.infer<typeof snapshotSchema>;
