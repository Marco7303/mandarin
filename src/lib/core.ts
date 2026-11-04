import { alignCharacters, normalizePinyin, plainPinyin } from './pinyin';
export type Direction = 'chinese' | 'pinyin' | 'english';
export const directions: Direction[] = ['chinese', 'pinyin', 'english'];
export type Entry = {
    id: string;
    setId: string;
    traditional: string;
    english: string;
    pinyin: string;
    numbered: string;
    alignment: {
        character: string;
        pinyin: string;
    }[];
    alignmentReview: boolean;
    notes: string;
    tags: string[];
    archived?: boolean;
    sourcePinyin?: string;
    partOfSpeech?: string;
    exampleTraditional?: string;
    examplePinyin?: string;
    exampleEnglish?: string;
};
export type Progress = {
    reviewCount: number;
    correctCount: number;
    incorrectCount: number;
    consecutiveCorrect: number;
    stage: number;
    lastResult: 'know' | 'learning';
    lastReviewed: string;
    /** Legacy review date, preserved when loading older libraries; no longer used. */
    nextReview?: string;
};
export type ProgressMap = Record<string, Progress>;
export type StarMap = Record<string, boolean>;
export function progressKey(entryId: string, direction: Direction) { return `${entryId}:${direction}`; }
export function makeEntry(input: Partial<Entry> & Pick<Entry, 'traditional' | 'english' | 'pinyin'>, setId = 'unit-1'): Entry {
    const normalized = normalizePinyin(input.pinyin, [...input.traditional].filter(c => /\p{Script=Han}/u.test(c)).length);
    return { id: globalThis.crypto.randomUUID(), setId, ...input, notes: input.notes ?? '', tags: input.tags ?? [], pinyin: /[0-5]|u:|v/.test(input.pinyin) && normalized.valid ? normalized.marked : input.pinyin, sourcePinyin: input.sourcePinyin ?? input.pinyin, numbered: normalized.numbered, ...alignCharacters(input.traditional, input.pinyin), ...(input.alignment ? { alignment: input.alignment, alignmentReview: input.alignmentReview ?? false } : {}) };
}
export function searchEntry(entry: Entry, query: string) {
    const haystack = [entry.traditional, entry.english, entry.pinyin, entry.numbered, entry.notes, ...entry.tags].join(' ').toLowerCase();
    const plain = plainPinyin(query);
    return haystack.includes(query.toLowerCase()) || (!!plain && plainPinyin(entry.pinyin).includes(plain));
}
/** A card stays learned until the user changes it or resets its progress. */
export function recordAnswer(previous: Progress | undefined, answer: 'know' | 'learning' | boolean, now = new Date()): Progress {
    const result = typeof answer === 'boolean' ? (answer ? 'know' : 'learning') : answer;
    const consecutiveCorrect = result === 'know' ? (previous?.consecutiveCorrect ?? 0) + 1 : 0;
    return { reviewCount: (previous?.reviewCount ?? 0) + 1, correctCount: (previous?.correctCount ?? 0) + (result === 'know' ? 1 : 0), incorrectCount: (previous?.incorrectCount ?? 0) + (result === 'learning' ? 1 : 0), consecutiveCorrect, stage: Math.min(6, consecutiveCorrect), lastResult: result, lastReviewed: now.toISOString() };
}
export function isLearned(progress: Progress | undefined) { return progress?.lastResult === 'know'; }
export function resetProgress(progress: ProgressMap, entryIds: string[]): ProgressMap {
    const ids = new Set(entryIds);
    return Object.fromEntries(Object.entries(progress).filter(([key]) => !ids.has(key.slice(0, key.lastIndexOf(':')))));
}
export function normalizeStudyPreferences<T extends { filter: string; order: string }>(preferences: T): T {
    return { ...preferences,
        filter: ['Learning', 'Learned', 'All', 'Starred'].includes(preferences.filter) ? preferences.filter : 'Learning',
        order: preferences.order === 'Random' ? 'Random' : 'Original',
    };
}
export type Prompt = {
    entryId: string;
    direction: Direction;
};
export type StudyOptions = {
    prompt: Direction | 'mixed';
    cards: 'all' | 'learning' | 'learned' | 'starred';
    order: 'random' | 'original';
    amount: number | 'all';
};
export function buildQueue(entries: Entry[], progress: ProgressMap, stars: StarMap, options: StudyOptions): Prompt[] {
    let queue: Prompt[] = [];
    for (const entry of entries.filter(e => !e.archived)) {
        const choices = options.prompt === 'mixed' ? directions : [options.prompt];
        const eligible = choices.filter(direction => {
            const key = progressKey(entry.id, direction);
            return options.cards === 'all' || (options.cards === 'learning' && !isLearned(progress[key])) || (options.cards === 'learned' && isLearned(progress[key])) || (options.cards === 'starred' && stars[key]);
        });
        // Starred mixed sessions include each explicitly starred front.
        const selected = options.prompt === 'mixed' && options.cards !== 'starred' && eligible.length
            ? [eligible[Math.floor(Math.random() * eligible.length)]] : eligible;
        queue.push(...selected.map(direction => ({ entryId: entry.id, direction })));
    }
    if (options.order === 'random')
        queue = queue.map(p => ({ p, r: Math.random() })).sort((a, b) => a.r - b.r).map(x => x.p);
    return options.amount === 'all' ? queue : queue.slice(0, options.amount);
}
