import { it, expect } from 'vitest';
import { parseDictionaryLine, lookupDictionary } from './dictionary';
it('parses optional CC-CEDICT suggestions without discarding alternative meanings', () => {
    const parsed = parseDictionaryLine('學生 学生 [xue2 sheng1] /student/schoolchild/');
    expect(parsed?.traditional).toBe('學生');
    expect(parsed?.pinyin).toBe('xué shēng');
    expect(parsed?.english).toBe('student; schoolchild');
    expect(parsed?.alignment).toEqual([{ character: '學', pinyin: 'xué' }, { character: '生', pinyin: 'shēng' }]);
    expect(parseDictionaryLine('# comment')).toBeUndefined();
});
it('has no dictionary dependency when an optional path is absent', async () => {
    expect(await lookupDictionary('學生', '')).toEqual([]);
});
