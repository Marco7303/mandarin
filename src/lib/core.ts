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
    nextReview: string;
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
export interface Scheduler {
    review(previous: Progress | undefined, result: 'know' | 'learning', now?: Date): Progress;
}
export function schedule(previous: Progress | undefined, answer: 'know' | 'learning' | boolean, now = new Date()): Progress {
    const result = typeof answer === 'boolean' ? (answer ? 'know' : 'learning') : answer;
    const consecutiveCorrect = result === 'know' ? (previous?.consecutiveCorrect ?? 0) + 1 : 0;
    const intervals = [1, 2, 5, 14, 30, 60];
    const days = result === 'learning' ? 1 : intervals[consecutiveCorrect] ?? Math.min(180, 60 + (consecutiveCorrect - 5) * 30);
    const next = new Date(now);
    next.setDate(next.getDate() + days);
    return { reviewCount: (previous?.reviewCount ?? 0) + 1, correctCount: (previous?.correctCount ?? 0) + (result === 'know' ? 1 : 0), incorrectCount: (previous?.incorrectCount ?? 0) + (result === 'learning' ? 1 : 0), consecutiveCorrect, stage: Math.min(6, consecutiveCorrect), lastResult: result, lastReviewed: now.toISOString(), nextReview: next.toISOString() };
}
export const defaultScheduler: Scheduler = { review: schedule };
export type Prompt = {
    entryId: string;
    direction: Direction;
};
export type StudyOptions = {
    prompt: Direction | 'mixed';
    cards: 'all' | 'due' | 'new' | 'difficult' | 'starred';
    order: 'review' | 'random' | 'original' | 'difficult' | 'new';
    amount: number | 'all';
};
export function buildQueue(entries: Entry[], progress: ProgressMap, stars: StarMap, options: StudyOptions, now = new Date()): Prompt[] {
    let queue: Prompt[] = [];
    for (const entry of entries.filter(e => !e.archived)) {
        const choices = options.prompt === 'mixed' ? directions : [options.prompt];
        const eligible = choices.filter(direction => {
            const key = progressKey(entry.id, direction), p = progress[key];
            return options.cards === 'all' || (options.cards === 'new' && !p) || (options.cards === 'due' && (!p || p.nextReview <= now.toISOString())) || (options.cards === 'difficult' && !!p && (p.lastResult === 'learning' || p.incorrectCount > p.correctCount)) || (options.cards === 'starred' && stars[key]);
        });
        if (eligible.length)
            queue.push({ entryId: entry.id, direction: eligible[Math.floor(Math.random() * eligible.length)] });
    }
    const score = (p: Prompt) => progress[progressKey(p.entryId, p.direction)];
    if (options.order === 'random')
        queue = queue.map(p => ({ p, r: Math.random() })).sort((a, b) => a.r - b.r).map(x => x.p);
    else if (options.order === 'review')
        queue.sort((a, b) => (score(a)?.nextReview ?? '').localeCompare(score(b)?.nextReview ?? ''));
    else if (options.order === 'difficult')
        queue.sort((a, b) => (score(b)?.incorrectCount ?? 0) - (score(a)?.incorrectCount ?? 0));
    else if (options.order === 'new')
        queue.sort((a, b) => Number(!!score(a)) - Number(!!score(b)));
    return options.amount === 'all' ? queue : queue.slice(0, options.amount);
}
