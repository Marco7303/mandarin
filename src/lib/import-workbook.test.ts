import { readSheet } from 'read-excel-file/node';
import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseRows, preflightXlsxArchive } from './importer';
it('imports the supplied workbook through the production importer', async () => {
    const archive = await readFile('Mandarin_Unit_1_3_Fields_Anki.xlsx');
    expect(preflightXlsxArchive(archive).uncompressedBytes).toBeLessThan(32 * 1024 * 1024);
    const rows = await readSheet('Mandarin_Unit_1_3_Fields_Anki.xlsx', 1);
    const imported = parseRows(rows, 'unit-1');
    expect(imported.errors).toEqual([]);
    expect(imported.warnings).toEqual([]);
    expect(imported.format).toBe('tabular');
    expect(imported.entries).toHaveLength(55);
    expect(imported.entries.find(e => e.traditional === '嗎')?.pinyin).toBe('ma');
    expect(imported.entries.find(e => e.traditional === '月')?.english).toBe('moon; month');
});
