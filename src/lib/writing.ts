import type { Entry, StarMap } from './core';

export type WritingLevel = 'trace' | 'copy' | 'recall';
export type WritingPrompt = 'pinyin' | 'english' | 'both';
// Keep repeated characters: 謝謝 is two positions, not one exercise.
export const writingCharacters = (word: string) => [...word].filter(char => /\p{Script=Han}/u.test(char));
export function buildWritingQueue(entries: Entry[], stars: StarMap, options: { starred: boolean; amount: number | 'all'; shuffle: boolean }): Entry[] {
    let batch = entries.filter(entry => !entry.archived && writingCharacters(entry.traditional).length && (!options.starred || ['chinese', 'english', 'pinyin'].some(front => stars[`${entry.id}:${front}`])));
    if (options.amount !== 'all') batch = batch.slice(0, options.amount);
    if (options.shuffle) for (let i = batch.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [batch[i], batch[j]] = [batch[j], batch[i]];
    }
    return batch;
}
