import { CHARACTER_DATA_VERSION } from './character-data-version';

export type CharacterDetail = {
    character: string;
    meaning: string;
    verified: boolean;
    hint: string;
    originalMeaning: string;
    components: { character: string; roles: string[]; hint: string; meaning: string }[];
    words: { traditional: string; meaning: string }[];
    history: { type: string; era: string; url: string; source: string }[];
    hasStrokes: boolean;
};
export type CharacterStrokes = { strokes: string[]; medians: number[][][] };
export const CHARACTER_DATA_ROOT = `/character-data/${CHARACTER_DATA_VERSION}`;
export const CHARACTER_CACHE = 'mori-character-data-v1';
export function charactersIn(text: string) {
    return [...new Set([...text].filter(char => /\p{Script=Han}/u.test(char)))];
}
export function characterShard(character: string) {
    if ([...character].length !== 1 || !/\p{Script=Han}/u.test(character)) throw new Error('Expected one Chinese character');
    return (character.codePointAt(0)! >> 8).toString(16);
}
export function characterSource(character: string) {
    return `https://www.dong-chinese.com/wiki/${encodeURIComponent(character)}`;
}

// Versioned, public reference data only. Never cache account or deck requests here.
// CacheStorage also works on the first visit before a service worker controls the page.
const requests = new Map<string, Promise<Record<string, unknown>>>();
async function loadShard<T>(kind: 'details' | 'strokes', character: string): Promise<T | null> {
    const url = `${CHARACTER_DATA_ROOT}/${kind}/${characterShard(character)}.json`;
    let pending = requests.get(url);
    if (!pending) {
        pending = (async () => {
            let cache: Cache | undefined;
            try { if (typeof caches !== 'undefined') cache = await caches.open(CHARACTER_CACHE); } catch { /* Private mode/quota: still allow online reference. */ }
            let response = await cache?.match(url);
            if (!response) {
                response = await fetch(url);
                if (response.status === 404) return {};
                if (!response.ok) throw new Error('Character reference unavailable');
                try { await cache?.put(url, response.clone()); } catch { /* A full cache must not break studying. */ }
            }
            const data = await response.json();
            return data.characters as Record<string, unknown>;
        })();
        requests.set(url, pending);
        // Keep memory bounded; persistent offline copies remain in CacheStorage.
        if (requests.size > 12) requests.delete(requests.keys().next().value!);
        pending.catch(() => { if (requests.get(url) === pending) requests.delete(url); });
    }
    return ((await pending)[character] as T | undefined) || null;
}
export const loadCharacter = (character: string) => loadShard<CharacterDetail>('details', character);
export const loadCharacterStrokes = (character: string) => loadShard<CharacterStrokes>('strokes', character);
