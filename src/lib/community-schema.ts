import { z } from 'zod';

export const communityQuerySchema = z.object({
    kind: z.enum(['set', 'folder']).optional(),
    q: z.string().trim().max(100).default(''),
    cursor: z.string().max(100).optional().refine(value => !value || (
        value.split('|').length === 2 && z.iso.datetime().safeParse(value.split('|')[0]).success &&
        z.uuid().safeParse(value.split('|')[1]).success
    ), 'Invalid page.'),
});
export const publicSetSchema = z.object({
    id: z.uuid(), name: z.string(), description: z.string(), creatorName: z.string(),
    wordCount: z.number().int().nonnegative(), updatedAt: z.iso.datetime(),
    kind: z.enum(['set', 'folder']).default('set'), setCount: z.number().int().positive().default(1),
});
export const communityPageSchema = z.object({ sets: z.array(publicSetSchema), nextCursor: z.string().nullable() });
export type PublicSet = z.infer<typeof publicSetSchema>;
export const reportSchema = z.object({
    reason: z.enum(['Inaccurate content', 'Inappropriate content', 'Copyright or spam']),
    details: z.string().trim().max(500).default(''),
});
