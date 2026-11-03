import Papa from 'papaparse';
import { makeEntry, type Entry } from './core';
import { normalizePinyin } from './pinyin';
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ENTRIES = 5000;
export const MAX_XLSX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
export const MAX_XLSX_FILES = 2048;
/** Validate ZIP metadata before allowing the XLSX reader to decompress anything. */
export function preflightXlsxArchive(input: ArrayBuffer | Uint8Array): {
    files: number;
    uncompressedBytes: number;
} {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const fail = (message = 'Malformed XLSX archive.'): never => { throw new Error(message); };
    if (bytes.length < 22)
        return fail();
    let end = -1;
    // EOCD has a fixed 22-byte header followed by at most 65535 comment bytes.
    for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 65535); at--) {
        if (view.getUint32(at, true) === 0x06054b50 && at + 22 + view.getUint16(at + 20, true) === bytes.length) {
            end = at;
            break;
        }
    }
    if (end < 0)
        return fail();
    if (end >= 20 && view.getUint32(end - 20, true) === 0x07064b50)
        return fail('ZIP64 workbooks are not supported.');
    const files = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
    if (files === 0xffff || size === 0xffffffff || start === 0xffffffff)
        return fail('ZIP64 workbooks are not supported.');
    if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== files)
        return fail();
    if (!files)
        return fail();
    if (files > MAX_XLSX_FILES)
        return fail('Workbook contains too many files. Maximum 2,048.');
    if (start + size !== end || start > end)
        return fail();
    let cursor = start, uncompressedBytes = 0;
    const offsets = new Set<number>();
    const names = new Set<string>();
    for (let index = 0; index < files; index++) {
        if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
            return fail();
        const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true);
        if (flags & 0x2041)
            return fail('Encrypted workbooks are not supported.');
        if (method !== 0 && method !== 8)
            return fail('Unsupported workbook compression.');
        const compressed = view.getUint32(cursor + 20, true), uncompressed = view.getUint32(cursor + 24, true);
        const nameLength = view.getUint16(cursor + 28, true), extraLength = view.getUint16(cursor + 30, true), commentLength = view.getUint16(cursor + 32, true);
        const local = view.getUint32(cursor + 42, true);
        if (compressed === 0xffffffff || uncompressed === 0xffffffff || local === 0xffffffff || view.getUint16(cursor + 34, true) === 0xffff)
            return fail('ZIP64 workbooks are not supported.');
        if (view.getUint16(cursor + 34, true) !== 0 || !nameLength || cursor + 46 + nameLength + extraLength + commentLength > end)
            return fail();
        uncompressedBytes += uncompressed;
        if (uncompressedBytes > MAX_XLSX_UNCOMPRESSED_BYTES)
            return fail('Workbook expands beyond 32 MB.');
        if (method === 0 && compressed !== uncompressed)
            return fail();
        const extraStart = cursor + 46 + nameLength, extraEnd = extraStart + extraLength;
        for (let extra = extraStart; extra < extraEnd;) {
            if (extra + 4 > extraEnd)
                return fail();
            const id = view.getUint16(extra, true), length = view.getUint16(extra + 2, true);
            if (id === 0x0001)
                return fail('ZIP64 workbooks are not supported.');
            if (id === 0x0017)
                return fail('Encrypted workbooks are not supported.');
            extra += 4 + length;
            if (extra > extraEnd)
                return fail();
        }
        if (offsets.has(local) || local + 30 > start || view.getUint32(local, true) !== 0x04034b50)
            return fail();
        offsets.add(local);
        const localFlags = view.getUint16(local + 6, true), localName = view.getUint16(local + 26, true), localExtra = view.getUint16(local + 28, true);
        if (localFlags & 0x2041)
            return fail('Encrypted workbooks are not supported.');
        if (localFlags !== flags || view.getUint16(local + 8, true) !== method || localName !== nameLength)
            return fail();
        if (local + 30 + localName + localExtra + compressed > start)
            return fail();
        if (!(flags & 8) && (view.getUint32(local + 18, true) !== compressed || view.getUint32(local + 22, true) !== uncompressed))
            return fail();
        const centralName = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
        const localNameBytes = bytes.subarray(local + 30, local + 30 + localName);
        if (centralName.some((byte, i) => byte !== localNameBytes[i]))
            return fail();
        const name = Array.from(centralName, byte => byte.toString(16).padStart(2, '0')).join('');
        if (names.has(name))
            return fail();
        names.add(name);
        cursor += 46 + nameLength + extraLength + commentLength;
    }
    if (cursor !== end)
        return fail();
    return { files, uncompressedBytes };
}
export type ImportIssue = {
    row: number;
    message: string;
};
export type ImportResult = {
    entries: Entry[];
    format: 'tabular' | 'vertical';
    errors: ImportIssue[];
    warnings: ImportIssue[];
};
const headers: Record<string, string> = { traditional: 'traditional', chinese: 'traditional', 'traditional chinese': 'traditional', english: 'english', meaning: 'english', pinyin: 'pinyin', notes: 'notes', tags: 'tags', partofspeech: 'partOfSpeech', 'part of speech': 'partOfSpeech', part_of_speech: 'partOfSpeech', exampletraditional: 'exampleTraditional', 'example traditional': 'exampleTraditional', example_chinese: 'exampleTraditional', examplepinyin: 'examplePinyin', 'example pinyin': 'examplePinyin', exampleenglish: 'exampleEnglish', 'example english': 'exampleEnglish' };
function value(cell: unknown): string { return cell === null || cell === undefined ? '' : String(cell).trim(); }
export function parseRows(source: unknown[][], setId = 'unit-1', forceFormat?: 'tabular' | 'vertical'): ImportResult {
    const rows = source.map((row, index) => ({ cells: row.map(value), row: index + 1 })).filter(row => row.cells.some(Boolean));
    const format = forceFormat ?? (rows.length && rows.every(row => row.cells.filter(Boolean).length <= 1) ? 'vertical' : 'tabular');
    const result: ImportResult = { entries: [], format, errors: [], warnings: [] };
    if (rows.length > MAX_ENTRIES * 3 + 1) {
        result.errors.push({ row: 0, message: `Use at most ${MAX_ENTRIES.toLocaleString()} entries.` });
        return result;
    }
    if (!rows.length) {
        result.errors.push({ row: 0, message: 'No entries found.' });
        return result;
    }
    const records: {
        row: number;
        traditional: string;
        english: string;
        pinyin: string;
        notes?: string;
        tags?: string[];
        partOfSpeech?: string;
        exampleTraditional?: string;
        examplePinyin?: string;
        exampleEnglish?: string;
    }[] = [];
    if (format === 'vertical') {
        const cells = rows.map(row => ({ value: row.cells.find(Boolean) ?? '', row: row.row }));
        for (let index = 0; index < cells.length; index += 3) {
            if (index + 2 >= cells.length) {
                result.errors.push({ row: cells[index].row, message: 'Incomplete three-field group.' });
                break;
            }
            records.push({ row: cells[index].row, traditional: cells[index].value, english: cells[index + 1].value, pinyin: cells[index + 2].value });
        }
    }
    else {
        const first = rows[0].cells.map(c => headers[c.toLowerCase()]);
        const hasHeaders = ['traditional', 'english', 'pinyin'].every(h => first.includes(h));
        for (const row of rows.slice(hasHeaders ? 1 : 0)) {
            const get = (name: string, fallback: number) => row.cells[hasHeaders ? first.indexOf(name) : fallback] ?? '';
            records.push({ row: row.row, traditional: get('traditional', 0), english: get('english', 1), pinyin: get('pinyin', 2), notes: get('notes', 3), tags: get('tags', 4).split(/[;,]/).map(t => t.trim()).filter(Boolean), partOfSpeech: get('partOfSpeech', 5), exampleTraditional: get('exampleTraditional', 6), examplePinyin: get('examplePinyin', 7), exampleEnglish: get('exampleEnglish', 8) });
        }
    }
    if (records.length > MAX_ENTRIES) {
        result.errors.push({ row: 0, message: `Use at most ${MAX_ENTRIES.toLocaleString()} entries.` });
        return result;
    }
    for (const record of records) {
        result.entries.push(makeEntry({ traditional: record.traditional, english: record.english, pinyin: record.pinyin, notes: record.notes, tags: record.tags, partOfSpeech: record.partOfSpeech, exampleTraditional: record.exampleTraditional, examplePinyin: record.examplePinyin, exampleEnglish: record.exampleEnglish }, setId));
    }
    const checked = validateEntries(result.entries);
    const sourceIssue = (issue: ImportIssue) => ({ ...issue, row: records[issue.row - 1]?.row ?? issue.row });
    result.errors.push(...checked.errors.map(sourceIssue));
    result.warnings.push(...checked.warnings.map(sourceIssue));
    return result;
}
/** Re-check an edited preview. The supplied entries and source values are never mutated. */
export function validateEntries(entries: Entry[]): Pick<ImportResult, 'errors' | 'warnings'> {
    const errors: ImportIssue[] = [], warnings: ImportIssue[] = [];
    if (entries.length > MAX_ENTRIES)
        errors.push({ row: 0, message: `Use at most ${MAX_ENTRIES.toLocaleString()} entries.` });
    if (!entries.length)
        errors.push({ row: 0, message: 'No entries found.' });
    const seen = new Set<string>();
    entries.forEach((entry, index) => {
        const row = index + 1;
        const missing = ['traditional', 'english', 'pinyin'].filter(key => !entry[key as 'traditional' | 'english' | 'pinyin'].trim());
        if (missing.length)
            errors.push({ row, message: `Missing ${missing.map(k => k === 'traditional' ? 'Chinese' : k === 'pinyin' ? 'Pinyin' : 'English').join(', ')}.` });
        const signature = [entry.traditional, entry.english, entry.pinyin].join('\u0000');
        if (seen.has(signature))
            warnings.push({ row, message: 'Possible duplicate.' });
        seen.add(signature);
        if (entry.pinyin && !normalizePinyin(entry.pinyin).valid)
            warnings.push({ row, message: 'Unrecognized Pinyin. Check the source value.' });
        const characterCount = [...entry.traditional].filter(c => /\p{Script=Han}/u.test(c)).length;
        const pronunciation = normalizePinyin(entry.pinyin, characterCount);
        if (!pronunciation.valid || characterCount !== pronunciation.syllables.length)
            warnings.push({ row, message: 'Character pronunciation needs review.' });
    });
    return { errors, warnings };
}
export function parseText(text: string, setId = 'unit-1', forceFormat?: 'tabular' | 'vertical'): ImportResult {
    if (new TextEncoder().encode(text).length > MAX_FILE_BYTES)
        return { entries: [], format: 'tabular', errors: [{ row: 0, message: 'File is too large. Maximum 5 MB.' }], warnings: [] };
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy', delimitersToGuess: [',', '\t'] });
    const result = parseRows(parsed.data, setId, forceFormat);
    for (const error of parsed.errors.filter(e => e.code !== 'UndetectableDelimiter'))
        result.errors.push({ row: (error.row ?? 0) + 1, message: error.message });
    return result;
}
export async function parseFile(file: File, setId = 'unit-1', forceFormat?: 'tabular' | 'vertical'): Promise<ImportResult> {
    const failure = (message: string): ImportResult => ({ entries: [], format: 'tabular', errors: [{ row: 0, message }], warnings: [] });
    if (file.size > MAX_FILE_BYTES)
        return failure('File is too large. Maximum 5 MB.');
    try {
        if (/\.csv$/i.test(file.name))
            return parseText(await file.text(), setId, forceFormat);
        if (!/\.xlsx$/i.test(file.name))
            return failure('Choose an XLSX or CSV file.');
        const buffer = await file.arrayBuffer();
        try {
            preflightXlsxArchive(buffer);
        }
        catch (error) {
            return failure(error instanceof Error ? error.message : 'Malformed XLSX archive.');
        }
        const { readSheet } = await import('read-excel-file/browser');
        // read-excel-file reads cell values only; it does not execute formulas or macros.
        const rows = await readSheet(buffer, 1);
        return parseRows(rows, setId, forceFormat);
    }
    catch {
        return failure('Unreadable file. Check the file and try again.');
    }
}
export function exportCSV(entries: Entry[]) {
    const safe = (v: string) => /^[\s]*[=+@-]/.test(v) ? `'${v}` : v;
    return '\uFEFF' + Papa.unparse({ fields: ['traditional', 'english', 'pinyin', 'notes', 'tags', 'partOfSpeech', 'exampleTraditional', 'examplePinyin', 'exampleEnglish'], data: entries.filter(e => !e.archived).map(e => [e.traditional, e.english, e.pinyin, e.notes, e.tags.join('; '), e.partOfSpeech ?? '', e.exampleTraditional ?? '', e.examplePinyin ?? '', e.exampleEnglish ?? ''].map(safe)) }, { quotes: true, newline: '\r\n' });
}
