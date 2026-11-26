'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Eye, Lightbulb, RotateCcw, X } from 'lucide-react';
import type { Entry } from '@/lib/core';
import { loadCharacterStrokes, type CharacterStrokes } from '@/lib/characters';
import { writingCharacters, type WritingLevel, type WritingPrompt } from '@/lib/writing';
import { WritingWriter } from '@/lib/writing-writer';

export default function WritingPractice({ entries, level, prompt, onExit }: { entries: Entry[]; level: WritingLevel; prompt: WritingPrompt; onExit: () => void }) {
    const [position, setPosition] = useState(0);
    const [characterIndex, setCharacterIndex] = useState(0);
    const [results, setResults] = useState<{ completed: boolean; assisted: boolean }[]>([]);
    const entry = entries[position];
    const characters = entry ? writingCharacters(entry.traditional) : [];
    const total = entries.reduce((sum, item) => sum + writingCharacters(item.traditional).length, 0);
    // Warm only this batch, with four requests at a time. Cached data also works offline.
    useEffect(() => {
        let active = true;
        const pending = [...new Set(entries.flatMap(item => writingCharacters(item.traditional)))];
        async function warm() {
            while (active && pending.length) {
                const character = pending.shift()!;
                try { await loadCharacterStrokes(character); } catch { /* The current character offers retry. */ }
            }
        }
        void Promise.all(Array.from({ length: Math.min(4, pending.length) }, warm));
        return () => { active = false; };
    }, [entries]);
    function next(completed: boolean, assisted: boolean) {
        setResults(previous => [...previous, { completed, assisted }]);
        if (characterIndex + 1 < characters.length) setCharacterIndex(value => value + 1);
        else { setCharacterIndex(0); setPosition(value => value + 1); }
    }
    if (!entry) return <section className="result" aria-label="Writing results"><div className="result-seal"><Check size={36}/></div><h1>Writing complete</h1><div className="result-stats"><div><strong>{results.filter(result => result.completed).length}</strong><span>Completed</span></div><div><strong>{results.filter(result => result.completed && result.assisted).length}</strong><span>With guidance</span></div><div><strong>{results.filter(result => !result.completed).length}</strong><span>Skipped</span></div></div><p className="settings-note">This practice session does not change your flashcard progress.</p><button className="button primary full" onClick={onExit}>Done <ArrowRight size={18}/></button></section>;
    return <section className="writing-session" aria-label="Writing practice">
        <header className="session-header"><button className="icon-button" aria-label="End writing practice" onClick={onExit}><X size={21}/></button><span>Word {position + 1} / {entries.length}</span><span className="writing-level">{level}</span></header>
        <div className="session-track"><span style={{ width: `${results.length / total * 100}%` }}/></div>
        <div className="writing-prompt">{(prompt === 'english' || prompt === 'both') && <h1>{entry.english}</h1>}{(prompt === 'pinyin' || prompt === 'both') && <p>{entry.pinyin}</p>}
            {level !== 'recall' && <div className="writing-word chinese" lang="zh-Hant-TW">{characters.map((char, i) => <span key={i} className={i === characterIndex ? 'current' : ''}>{char}</span>)}</div>}
            <span className="muted">Character {characterIndex + 1} of {characters.length}</span>
        </div>
        <DrawingCard key={`${position}:${characterIndex}`} character={characters[characterIndex]} level={level} onNext={next}/>
        <details className="writing-notes"><summary>About stroke checking</summary><p>Draw each stroke in order and direction. Accepted strokes snap to the reference shape. This checks stroke structure, not handwriting quality. Some reference forms and stroke orders differ from Taiwan standards.</p><p>Open this batch once online to cache its stroke data for offline practice. Results are for this session only.</p><a href="/character-data/README.txt" target="_blank" rel="noreferrer">Character data & licences</a><span> · </span><a href="/licenses/hanzi-writer.txt" target="_blank" rel="noreferrer">Hanzi Writer · MIT</a></details>
    </section>;
}

function DrawingCard({ character, level, onNext }: { character: string; level: WritingLevel; onNext: (completed: boolean, assisted: boolean) => void }) {
    const [data, setData] = useState<CharacterStrokes | null>();
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [retry, setRetry] = useState(0);
    const [complete, setComplete] = useState(false);
    const [accepted, setAccepted] = useState(0);
    const [assisted, setAssisted] = useState(level !== 'recall');
    const [showAnswer, setShowAnswer] = useState(false);
    const [message, setMessage] = useState('Draw the first stroke.');
    const [animating, setAnimating] = useState(false);
    const host = useRef<HTMLDivElement>(null);
    const writer = useRef<WritingWriter | null>(null);
    useEffect(() => {
        let active = true;
        loadCharacterStrokes(character).then(result => { if (active) setData(result); }).catch(() => { if (active) setError(true); });
        return () => { active = false; };
    }, [character, retry]);
    useEffect(() => {
        if (!data || !host.current) return;
        let active = true;
        const node = host.current;
        const instance = new WritingWriter(node, {
            width: node.clientWidth, height: node.clientWidth, padding: 22, showCharacter: false, showOutline: level === 'trace',
            strokeColor: '#365e4b', drawingColor: '#27352e', outlineColor: '#e4e8df', highlightColor: '#a87036',
            drawingWidth: 7, strokeAnimationSpeed: 1, delayBetweenStrokes: 180,
            charDataLoader: () => data,
        });
        const resize = new ResizeObserver(() => instance.updateDimensions({ width: node.clientWidth, height: node.clientWidth }));
        resize.observe(node);
        writer.current = instance;
        void instance.setCharacter(character).then(() => {
            if (!active) return;
            return instance.quiz({ acceptBackwardsStrokes: false, markStrokeCorrectAfterMisses: false, showHintAfterMisses: false, leniency: 1,
                onCorrectStroke: event => { if (active) { setAccepted(event.strokeNum + 1); setMessage(event.strokesRemaining ? 'Stroke accepted. Keep going.' : 'Character complete.'); } },
                onMistake: () => { if (active) setMessage('Try again. Check the stroke’s shape, direction and order.'); },
                onComplete: () => { if (active) setComplete(true); },
            });
        }).catch(() => { if (active) setError(true); });
        return () => { active = false; resize.disconnect(); instance.dispose(); writer.current = null; node.replaceChildren(); };
    }, [data, character, level, attempt]);
    function restart() {
        setComplete(false); setAccepted(0); setAnimating(false); setMessage('Draw the first stroke.'); setAttempt(value => value + 1);
    }
    async function demonstrate() {
        const instance = writer.current;
        if (!instance) return;
        setAssisted(true); setAnimating(true); setMessage('Watch the stroke order, then try again.');
        try { await instance.animateCharacter(); } finally {
            // Ignore a demonstration that was interrupted by leaving this character.
            if (writer.current === instance) restart();
        }
    }
    return <>
        <div className="writing-feedback" role="status" aria-live="polite">{error ? 'Stroke data could not load. Connect once online and try again.' : data === null ? 'No stroke data for this character. You can skip it.' : !data ? 'Loading stroke data…' : complete ? <><Check size={18}/>Character complete</> : message}</div>
        {showAnswer && <p className="writing-answer chinese" lang="zh-Hant-TW">{character}</p>}
        <div className="writing-board" role="group" aria-label="Character drawing area" aria-describedby="drawing-instructions">
            <div ref={host} className="writing-target"/>
            {(!data || error) && <span className="writing-placeholder">{error ? <button className="button secondary" onClick={() => { setError(false); setData(undefined); setRetry(value => value + 1); }}>Try again</button> : data === null ? 'Unavailable' : 'Loading…'}</span>}
        </div>
        <p id="drawing-instructions" className="writing-instructions">{data && !error ? `${accepted} / ${data.strokes.length} strokes · ` : ''}Draw with your finger, stylus or mouse.</p>
        <div className="writing-tools">
            <button className="text-button" disabled={!data || error || animating || complete} onClick={() => { setAssisted(true); void writer.current?.highlightStroke(accepted); }}><Lightbulb size={17}/>Hint</button>
            {level === 'recall' && <button className="text-button" onClick={() => { setAssisted(true); setShowAnswer(value => !value); }}><Eye size={17}/>{showAnswer ? 'Hide' : 'Show'} character</button>}
            <button className="text-button" disabled={!data || error || animating} onClick={() => void demonstrate()}><Eye size={17}/>Stroke order</button>
            <button className="text-button" disabled={!data || error || animating} onClick={restart}><RotateCcw size={17}/>Retry</button>
        </div>
        <div className="writing-actions"><button className="button secondary" onClick={() => onNext(false, assisted)}>Skip <ArrowRight size={17}/></button><button className="button primary" disabled={!complete || animating} onClick={() => onNext(true, assisted)}>Next <ArrowRight size={18}/></button></div>
    </>;
}
