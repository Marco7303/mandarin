import { lookupDictionary, dictionaryAttribution } from '../src/lib/dictionary';
async function main() {
    const query = process.argv[2];
    if (!query)
        throw new Error('Usage: node --import tsx scripts/lookup-dictionary.ts 學生');
    if (!process.env.CEDICT_PATH)
        throw new Error('Set CEDICT_PATH to an uncompressed CC-CEDICT UTF-8 file.');
    console.log(JSON.stringify({ suggestions: await lookupDictionary(query), attribution: dictionaryAttribution }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
