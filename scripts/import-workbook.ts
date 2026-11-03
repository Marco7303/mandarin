import { readSheet } from 'read-excel-file/node';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseRows, preflightXlsxArchive } from '../src/lib/importer';
async function main() {
    const path = process.argv[2] ?? 'Mandarin_Unit_1_3_Fields_Anki.xlsx';
    preflightXlsxArchive(await readFile(path));
    const rows = await readSheet(path, 1);
    const imported = parseRows(rows, 'unit-1');
    if (imported.errors.length)
        throw new Error(JSON.stringify(imported.errors));
    await mkdir('src/data', { recursive: true });
    // Deterministic IDs keep persisted reviews attached to the same source entry.
    const entries = imported.entries.map((entry, index) => ({ ...entry, id: `unit-1-${index + 1}` }));
    await writeFile('src/data/unit1.json', JSON.stringify(entries, null, 2) + '\n');
    await writeFile('src/data/import-report.json', JSON.stringify({ source: path, format: imported.format, count: entries.length, errors: imported.errors, warnings: imported.warnings }, null, 2) + '\n');
    console.log(JSON.stringify({ format: imported.format, count: entries.length, warnings: imported.warnings }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
