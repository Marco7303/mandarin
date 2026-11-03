// Server-only by construction: this module uses Node filesystem APIs and is only
// imported by the dictionary route/CLI. Never import it into a client component.
import { readFile, stat } from 'node:fs/promises';
import { normalizePinyin, alignCharacters } from './pinyin';
export const dictionaryAttribution = 'CC-CEDICT · CC BY-SA 4.0 · https://cc-cedict.org/';
export type DictionarySuggestion = {
    traditional: string;
    simplified: string;
    pinyin: string;
    english: string;
    alignment: {
        character: string;
        pinyin: string;
    }[];
};
export function parseDictionaryLine(line: string): DictionarySuggestion | undefined {
    const matched = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.*)\/$/);
    if (!matched)
        return;
    const [, traditional, simplified, numbered, definitions] = matched;
    const pinyin = normalizePinyin(numbered).marked;
    return { traditional, simplified, pinyin, english: definitions.split('/').join('; '), alignment: alignCharacters(traditional, pinyin).alignment };
}
let cached: {
    path: string;
    modified: number;
    entries: Map<string, DictionarySuggestion[]>;
} | undefined;
export async function lookupDictionary(query: string, path = process.env.CEDICT_PATH): Promise<DictionarySuggestion[]> {
    if (!path)
        return [];
    const info = await stat(path);
    if (info.size > 50 * 1024 * 1024)
        throw new Error('Dictionary exceeds 50 MB.');
    if (!cached || cached.path !== path || cached.modified !== info.mtimeMs) {
        const entries = new Map<string, DictionarySuggestion[]>();
        for (const line of (await readFile(path, 'utf8')).split(/\r?\n/)) {
            if (line.startsWith('#'))
                continue;
            const entry = parseDictionaryLine(line);
            if (!entry)
                continue;
            for (const key of new Set([entry.traditional, entry.simplified]))
                entries.set(key, [...(entries.get(key) ?? []), entry]);
        }
        cached = { path, modified: info.mtimeMs, entries };
    }
    return (cached.entries.get(query) ?? []).slice(0, 12);
}
