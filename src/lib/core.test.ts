import { describe, it, expect } from 'vitest';
import { alignCharacters, normalizePinyin } from './pinyin';
import { buildQueue, makeEntry, progressKey, recordAnswer, isLearned, normalizeStudyPreferences, resetProgress, searchEntry } from './core';
import { exportCSV, parseRows, parseText, validateEntries, preflightXlsxArchive, parseFile } from './importer';
describe('Pinyin', () => {
    it('converts numbered, marked, neutral, ü and input alternatives', () => {
        expect(normalizePinyin('xue2 sheng1').marked).toBe('xué shēng');
        expect(normalizePinyin('xuéshēng', 2).numbered).toBe('xue2 sheng1');
        expect(normalizePinyin('ma de men ne').numbered).toBe('ma5 de5 men5 ne5');
        expect(normalizePinyin('nu:3 lv4').marked).toBe('nǚ lǜ');
        expect(normalizePinyin('gui4 liu2 ou3').marked).toBe('guì liú ǒu');
    });
    it('handles apostrophes, decomposed marks, neutral zero and rejects extra digits', () => {
        expect(normalizePinyin("xi1'an1").marked).toBe('xī ān');
        expect(normalizePinyin('nǚ'.normalize('NFD')).numbered).toBe('nü3');
        expect(normalizePinyin('ma0').numbered).toBe('ma5');
        expect(normalizePinyin('lüe4').marked).toBe('lüè');
        expect(normalizePinyin('xue22').valid).toBe(false);
        expect(normalizePinyin('123').valid).toBe(false);
        expect(normalizePinyin('xue6').valid).toBe(false);
    });
    it('aligns entry-specific pronunciation and flags mismatches', () => {
        expect(alignCharacters('學生', 'xuéshēng')).toEqual({ alignment: [{ character: '學', pinyin: 'xué' }, { character: '生', pinyin: 'shēng' }], alignmentReview: false });
        expect(alignCharacters('銀行', 'yín háng').alignment[1].pinyin).toBe('háng');
        expect(alignCharacters('學生', 'xué').alignmentReview).toBe(true);
        expect(normalizePinyin('not-pinyin').valid).toBe(false);
    });
});
describe('progress and stars', () => {
    it('keeps learned cards learned regardless of elapsed time, independently by front', () => {
        const now = new Date('2020-01-01T12:00:00Z');
        const entry = makeEntry({ id: '1', traditional: '學生', english: 'student', pinyin: 'xuéshēng' });
        const learned = recordAnswer(undefined, true, now);
        const progress = { [progressKey('1', 'chinese')]: learned };
        expect(isLearned(learned)).toBe(true);
        expect(learned.nextReview).toBeUndefined();
        expect(buildQueue([entry], progress, {}, { prompt: 'chinese', cards: 'learning', order: 'original', amount: 'all' })).toEqual([]);
        expect(buildQueue([entry], progress, {}, { prompt: 'chinese', cards: 'learned', order: 'original', amount: 'all' })).toEqual([{ entryId: '1', direction: 'chinese' }]);
        expect(buildQueue([entry], progress, {}, { prompt: 'english', cards: 'learning', order: 'original', amount: 'all' })).toEqual([{ entryId: '1', direction: 'english' }]);
        const changed = recordAnswer(learned, false);
        expect(isLearned(changed)).toBe(false);
        expect(changed.reviewCount).toBe(2);
    });
    it('uses old answers while ignoring old review dates and includes unseen cards in Learning', () => {
        const entries = ['known', 'learning', 'unseen'].map(id => makeEntry({ id, traditional: '你', english: 'you', pinyin: 'nǐ' }));
        const progress = { 'known:chinese': { ...recordAnswer(undefined, true), nextReview: '2000-01-01T00:00:00.000Z' }, 'learning:chinese': { ...recordAnswer(undefined, false), nextReview: '2099-01-01T00:00:00.000Z' } };
        const options = { prompt: 'chinese', cards: 'learning', order: 'original', amount: 'all' } as const;
        expect(buildQueue(entries, progress, {}, options).map(p => p.entryId)).toEqual(['learning', 'unseen']);
        expect(buildQueue(entries, progress, {}, { ...options, cards: 'all' })).toHaveLength(3);
    });
    it('resets only the chosen words across all fronts', () => {
        const progress = { '1:chinese': recordAnswer(undefined, true), '1:english': recordAnswer(undefined, true), '2:chinese': recordAnswer(undefined, true) };
        expect(Object.keys(resetProgress(progress, ['1']))).toEqual(['2:chinese']);
        expect(Object.keys(progress)).toHaveLength(3);
    });
    it('replaces legacy study filters and orders without losing other preferences', () => {
        for (const filter of ['Due', 'New', 'Difficult']) expect(normalizeStudyPreferences({ filter, order: 'Review order', prompt: 'pinyin' })).toEqual({ filter: 'Learning', order: 'Original', prompt: 'pinyin' });
        expect(normalizeStudyPreferences({ filter: 'Learned', order: 'Random' })).toEqual({ filter: 'Learned', order: 'Random' });
    });
    it('uses the original English dimension for mixed starred study', () => {
        const e = makeEntry({ id: '1', traditional: '學生', english: 'student', pinyin: 'xuéshēng' });
        const queue = buildQueue([e], {}, { '1:english': true }, { prompt: 'mixed', cards: 'starred', order: 'original', amount: 'all' });
        expect(queue).toEqual([{ entryId: '1', direction: 'english' }]);
    });
    it('searches numbered and unmarked Pinyin', () => {
        const e = makeEntry({ traditional: '學生', english: 'student', pinyin: 'xuéshēng' });
        expect(searchEntry(e, 'xuesheng')).toBe(true);
        expect(searchEntry(e, 'xue2 sheng1')).toBe(true);
    });
});
describe('import and export', () => {
    it('reads tabular and vertical data without losing meanings or neutral tones', () => {
        const tab = parseText('traditional,english,pinyin\n你,you,nǐ\n們,"plural; people (suffix)",men');
        expect(tab.errors).toEqual([]);
        expect(tab.entries[1].pinyin).toBe('men');
        expect(tab.entries[1].english).toBe('plural; people (suffix)');
        const vertical = parseRows([['你'], ['you'], ['nǐ'], ['們'], ['plural suffix'], ['men']]);
        expect(vertical.format).toBe('vertical');
        expect(vertical.entries).toHaveLength(2);
        const pasted = parseText('你\nyou; you (singular)\nnǐ\n們\nplural suffix\nmen');
        expect(pasted.format).toBe('vertical');
        expect(pasted.entries[0].english).toBe('you; you (singular)');
    });
    it('blocks missing fields and incomplete groups and flags duplicates', () => {
        expect(parseRows([['你'], ['you']]).errors[0].message).toMatch('Incomplete');
        expect(parseRows([['你', 'you', '']]).errors[0].message).toMatch('Pinyin');
        expect(parseRows([['你', 'you', 'nǐ'], ['你', 'you', 'nǐ']]).warnings[0].message).toMatch('duplicate');
    });
    it('revalidates edited previews without mutating source values', () => {
        const imported = parseRows([['學生', '', 'badpinyin']]);
        expect(imported.errors).toHaveLength(1);
        expect(imported.warnings.length).toBeGreaterThan(0);
        const source = JSON.stringify(imported.entries);
        const fixed = imported.entries.map(e => ({ ...e, english: 'student', pinyin: 'xuéshēng' }));
        expect(validateEntries(fixed)).toEqual({ errors: [], warnings: [] });
        expect(JSON.stringify(imported.entries)).toBe(source);
        expect(fixed[0].sourcePinyin).toBe('badpinyin');
        expect(validateEntries([{ ...fixed[0], traditional: '' }]).errors[0].message).toMatch('Chinese');
        expect(validateEntries([fixed[0], fixed[0]]).warnings[0].message).toMatch('duplicate');
    });
    it('round trips ordinary data and protects spreadsheet formulas', () => {
        const e = makeEntry({ traditional: '學生', english: 'student; pupil', pinyin: 'xuéshēng' });
        expect(parseText(exportCSV([e])).entries[0].english).toBe(e.english);
        expect(exportCSV([{ ...e, english: '=HYPERLINK("bad")' }])).toContain("'=HYPERLINK");
    });
});
describe('XLSX archive preflight', () => {
    // A tiny stored ZIP containing one byte. No decompression is needed to inspect it.
    function archive(options: {
        expanded?: number;
        flags?: number;
        files?: number;
        zip64?: boolean;
    } = {}) {
        const bytes = new Uint8Array(101), v = new DataView(bytes.buffer);
        v.setUint32(0, 0x04034b50, true);
        v.setUint16(6, options.flags ?? 0, true);
        v.setUint32(18, 1, true);
        v.setUint32(22, options.expanded ?? 1, true);
        v.setUint16(26, 1, true);
        bytes[30] = 97;
        bytes[31] = 120;
        const central = 32;
        v.setUint32(central, 0x02014b50, true);
        v.setUint16(central + 8, options.flags ?? 0, true);
        v.setUint32(central + 20, 1, true);
        v.setUint32(central + 24, options.expanded ?? 1, true);
        v.setUint16(central + 28, 1, true);
        bytes[78] = 97;
        const end = 79;
        v.setUint32(end, 0x06054b50, true);
        v.setUint16(end + 8, options.files ?? 1, true);
        v.setUint16(end + 10, options.files ?? 1, true);
        v.setUint32(end + 12, options.zip64 ? 0xffffffff : 47, true);
        v.setUint32(end + 16, central, true);
        return bytes;
    }
    it('accepts bounded metadata and rejects an over-budget declared expansion', () => {
        expect(preflightXlsxArchive(archive())).toEqual({ files: 1, uncompressedBytes: 1 });
        expect(() => preflightXlsxArchive(archive({ expanded: 32 * 1024 * 1024 + 1 }))).toThrow('32 MB');
    });
    it('rejects excessive records, encryption, ZIP64 and malformed central data', () => {
        expect(() => preflightXlsxArchive(archive({ files: 2049 }))).toThrow('too many');
        expect(() => preflightXlsxArchive(archive({ flags: 1 }))).toThrow('Encrypted');
        expect(() => preflightXlsxArchive(archive({ zip64: true }))).toThrow('ZIP64');
        const malformed = archive();
        malformed[32] = 0;
        expect(() => preflightXlsxArchive(malformed)).toThrow('Malformed');
        expect(() => preflightXlsxArchive(new Uint8Array(20))).toThrow('Malformed');
        const incomplete = archive();
        incomplete[79 + 16] = 0;
        expect(() => preflightXlsxArchive(incomplete)).toThrow('Malformed');
    });
    it('rejects an unsafe XLSX before calling the spreadsheet decoder', async () => {
        const result = await parseFile(new File([archive({ expanded: 32 * 1024 * 1024 + 1 }).buffer as ArrayBuffer], 'unsafe.xlsx'));
        expect(result.entries).toEqual([]);
        expect(result.errors[0].message).toContain('32 MB');
    });
    it('does not lose optional entry fields during CSV round trips', () => {
        const e = makeEntry({ traditional: '學生', english: 'student', pinyin: 'xuéshēng', notes: 'line 1\nline 2', tags: ['class', 'people'], partOfSpeech: 'noun', exampleTraditional: '我是學生。', examplePinyin: 'wǒ shì xuéshēng', exampleEnglish: 'I am a student.' });
        const result = parseText(exportCSV([e]));
        expect(result.errors).toEqual([]);
        expect(result.entries[0]).toMatchObject({ traditional: e.traditional, english: e.english, pinyin: e.pinyin, notes: e.notes, tags: e.tags, partOfSpeech: e.partOfSpeech, exampleTraditional: e.exampleTraditional, examplePinyin: e.examplePinyin, exampleEnglish: e.exampleEnglish });
    });
});
