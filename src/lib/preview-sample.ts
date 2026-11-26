import { makeEntry } from './core';

// Explicitly limited to this experiment. A database outage must never seed an
// account library or make the live app appear to have lost its vocabulary.
export function isWritingPreview(environment?: string, branch?: string) {
    return environment === 'preview' && branch === 'feature/writing-practice';
}
export function needsPreviewSample(enabled: boolean, owner: string, setCount: number, entryCount: number) {
    return enabled && owner === 'guest' && setCount === 0 && entryCount === 0;
}
export function createPreviewSample() {
    const folderId = 'writing-preview-folder';
    const setId = 'writing-preview-sample';
    const words = [
        ['一', 'yī', 'one'], ['二', 'èr', 'two'], ['三', 'sān', 'three'], ['十', 'shí', 'ten'],
        ['人', 'rén', 'person'], ['口', 'kǒu', 'mouth'], ['大', 'dà', 'big'], ['小', 'xiǎo', 'small'],
        ['上', 'shàng', 'up; above'], ['下', 'xià', 'down; below'], ['中', 'zhōng', 'middle'], ['山', 'shān', 'mountain'],
        ['木', 'mù', 'wood; tree'], ['水', 'shuǐ', 'water'], ['火', 'huǒ', 'fire'], ['日', 'rì', 'sun; day'],
        ['月', 'yuè', 'moon; month'], ['你', 'nǐ', 'you'], ['你好', 'nǐ hǎo', 'hello'], ['謝謝', 'xièxie', 'thank you'],
    ];
    return {
        folder: { id: folderId, name: 'Preview samples' },
        set: { id: setId, folderId, name: 'Writing practice · sample set' },
        entries: words.map(([traditional, pinyin, english], i) => makeEntry({ id: `${setId}-${i + 1}`, traditional, pinyin, english }, setId)),
    };
}
