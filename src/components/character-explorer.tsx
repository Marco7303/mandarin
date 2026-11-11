'use client';

import { useEffect, useId, useState } from 'react';
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Pause, Play, RotateCcw } from 'lucide-react';
import { charactersIn, characterSource, loadCharacter, loadCharacterStrokes, type CharacterDetail, type CharacterStrokes } from '@/lib/characters';

const roles: Record<string, string> = {
    meaning: 'Meaning', sound: 'Sound', iconic: 'Visual origin', remnant: 'Partial form',
    simplified: 'Simplified form', deleted: 'Removed in modern form', distinguishing: 'Distinguishing mark', unknown: 'Uncertain role',
};

/** Supplemental reference stays behind a disclosure and never exposes an unrevealed answer. */
export function CharacterExplorer({ word }: { word: string }) {
    const [open, setOpen] = useState(false);
    const characters = charactersIn(word);
    if (!characters.length) return null;
    return <details className="character-explorer" onToggle={event => setOpen(event.currentTarget.open)}
        onKeyDown={event => event.stopPropagation()} onTouchStart={event => event.stopPropagation()} onTouchEnd={event => event.stopPropagation()}>
        <summary><BookOpen size={15}/><span>Character details</span><ChevronDown size={15}/></summary>
        {open && <CharacterBrowser key={word} characters={characters}/>}
    </details>;
}

function CharacterBrowser({ characters }: { characters: string[] }) {
    const [selected, setSelected] = useState(characters[0]);
    return <div className="character-reference">
        <div className="character-picker" role="group" aria-label="Choose a character">
            {characters.map(character => <button type="button" key={character} className="chinese" lang="zh-Hant" aria-pressed={selected === character} aria-label={`Explore ${character}`} onClick={() => setSelected(character)}>{character}</button>)}
            {!characters.includes(selected) && <button type="button" className="chinese" lang="zh-Hant" aria-pressed="true" aria-label={`Explore ${selected}`}>{selected}</button>}
        </div>
        <CharacterEntry key={selected} character={selected} onSelect={setSelected}/>
    </div>;
}

function CharacterEntry({ character, onSelect }: { character: string; onSelect: (character: string) => void }) {
    const [data, setData] = useState<CharacterDetail | null | undefined>();
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        loadCharacter(character).then(result => { if (active) { setData(result); setError(false); } }).catch(() => { if (active) setError(true); });
        return () => { active = false; };
    }, [character, attempt]);
    if (error) return <div className="character-message" role="status"><p>Character details couldn’t load. If you’re offline, open them once online first.</p><button type="button" className="text-button" onClick={() => { setError(false); setAttempt(value => value + 1); }}>Try again</button></div>;
    if (data === undefined) return <p className="character-message" role="status">Loading character details…</p>;
    if (data === null) return <div className="character-message"><p>No local reference for this character.</p><a href={characterSource(character)} target="_blank" rel="noreferrer">Look up {character} on Dong Chinese <ExternalLink size={13}/></a></div>;
    return <article aria-label={`Character reference for ${character}`}>
        <header className="character-overview"><strong className="chinese" lang="zh-Hant">{character}</strong><div><h3>{data.meaning || 'Character reference'}</h3><span>{data.verified ? 'Verified on Dong Chinese' : 'Basic dictionary entry · explanation not verified'}</span></div></header>
        {data.verified && (data.hint || data.components.length > 0) && <section className="character-section"><h4>Components & meaning</h4>{data.hint && <p>{data.hint}</p>}{data.originalMeaning && <p><span className="character-caption">Original meaning:</span> {data.originalMeaning}</p>}
            {data.components.length > 0 && <ul className="component-list">{data.components.map((part, index) => <li key={index}>
                <button type="button" className="component-glyph chinese" lang="zh-Hant" disabled={charactersIn(part.character).length !== 1 || [...part.character].length !== 1} aria-label={`Explore component ${part.character}`} onClick={() => onSelect(part.character)}>{part.character || '？'}</button>
                <div><div className="component-description"><strong>{part.meaning || 'Component'}</strong><span>{part.roles.map(role => roles[role] || 'Uncertain role').join(' · ')}</span></div>{part.hint && <p>{part.hint}</p>}</div>
            </li>)}</ul>}
        </section>}
        {data.hasStrokes && <StrokeSection character={character}/>}
        {data.words.length > 0 && <details className="character-section character-subsection"><summary>Common words <ChevronDown size={14}/></summary><ul className="character-words">{data.words.map(word => <li key={word.traditional}><span className="chinese" lang="zh-Hant">{word.traditional}</span><span>{word.meaning}</span></li>)}</ul></details>}
        {data.history.length > 0 && <details className="character-section character-subsection"><summary>Historical forms <ChevronDown size={14}/></summary><p className="character-caption">Open the source images to compare earlier forms. Internet connection required.</p><div className="character-history">{data.history.map(form => <a href={form.url} key={form.type} target="_blank" rel="noreferrer"><strong>{form.type === 'Oracle' ? 'Oracle bone' : form.type} script <ExternalLink size={12}/></strong><span>{form.era}</span></a>)}</div><a className="character-source-link" href={characterSource(character)} target="_blank" rel="noreferrer">View evolution on Dong Chinese <ExternalLink size={12}/></a></details>}
        <footer className="character-attribution"><a href={characterSource(character)} target="_blank" rel="noreferrer">Dong Chinese Character Wiki <ExternalLink size={12}/></a><a href="/character-data/README.txt" target="_blank" rel="noreferrer">Data & licences · CC BY-SA 4.0</a></footer>
    </article>;
}

function StrokeSection({ character }: { character: string }) {
    const [open, setOpen] = useState(false);
    return <details className="character-section character-subsection" onToggle={event => { event.stopPropagation(); setOpen(event.currentTarget.open); }}><summary>Stroke order <ChevronDown size={14}/></summary>{open && <StrokeLoader character={character}/>}</details>;
}

function StrokeLoader({ character }: { character: string }) {
    const [data, setData] = useState<CharacterStrokes | null>(null);
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        loadCharacterStrokes(character).then(result => { if (active) { setData(result); setError(!result); } }).catch(() => { if (active) setError(true); });
        return () => { active = false; };
    }, [character, attempt]);
    if (error) return <div className="character-message"><p>Stroke order couldn’t load. Open it online to make it available offline.</p><button type="button" className="text-button" onClick={() => { setError(false); setAttempt(v => v + 1); }}>Try again</button></div>;
    return data ? <StrokePlayer character={character} data={data}/> : <p role="status">Loading stroke order…</p>;
}

function StrokePlayer({ character, data }: { character: string; data: CharacterStrokes }) {
    const [step, setStep] = useState(data.strokes.length);
    const [playing, setPlaying] = useState(false);
    const id = useId().replaceAll(':', '');
    const total = data.strokes.length;
    useEffect(() => {
        if (!playing) return;
        const timer = setTimeout(() => { if (step >= total) setPlaying(false); else setStep(value => value + 1); }, 850);
        return () => clearTimeout(timer);
    }, [playing, step, total]);
    return <div className="stroke-player">
        <svg className="stroke-canvas" viewBox="0 0 1024 1024" role="img" aria-label={`Stroke order for ${character}: ${step} of ${total} strokes`}>
            <path d="M0 512H1024M512 0V1024M0 0L1024 1024M1024 0L0 1024" className="stroke-grid"/>
            <g transform="translate(0,900) scale(1,-1)">
                {data.strokes.map((path, index) => <g key={index}>
                    <path d={path} fill={index < step - 1 || (index < step && !playing) ? 'currentColor' : '#e8ebe5'}/>
                    {index === step - 1 && playing && <><defs><clipPath id={`${id}-${index}`}><path d={path}/></clipPath></defs>{data.medians[index]?.length ? <path key={`${index}-active`} className="stroke-draw" d={`M${data.medians[index].map(point => point.join(',')).join(' L')}`} clipPath={`url(#${id}-${index})`} pathLength={1} stroke="currentColor" strokeWidth={160} strokeLinecap="round" fill="none"/> : <path d={path} fill="currentColor"/>}</>}
                </g>)}
            </g>
        </svg>
        <div className="stroke-controls"><button type="button" className="icon-button" aria-label="Previous stroke" disabled={step === 0} onClick={() => { setPlaying(false); setStep(v => v - 1); }}><ChevronLeft size={18}/></button>
            <button type="button" className="button secondary" onClick={() => { if (playing) setPlaying(false); else { if (step >= total || step === 0) setStep(1); setPlaying(true); } }}>{playing ? <Pause size={15}/> : <Play size={15}/>} {playing ? 'Pause' : 'Play'}</button>
            <button type="button" className="icon-button" aria-label="Next stroke" disabled={step === total} onClick={() => { setPlaying(false); setStep(v => v + 1); }}><ChevronRight size={18}/></button>
            <button type="button" className="icon-button" aria-label="Reset strokes" onClick={() => { setPlaying(false); setStep(0); }}><RotateCcw size={16}/></button>
        </div>
        <label className="stroke-position"><span>{step} / {total} strokes</span><input type="range" min={0} max={total} value={step} aria-label="Stroke position" onChange={e => { setPlaying(false); setStep(Number(e.target.value)); }}/></label>
        <p className="character-caption">Reference forms and stroke order may vary from Taiwan’s handwriting standard.</p>
        <p className="character-caption">Make Me a Hanzi · © 1999 Arphic Technology Co., Ltd. <a href="/character-data/ARPHICPL.txt" target="_blank" rel="noreferrer">Arphic Public License</a> · Freely redistributable; no warranty.</p>
    </div>;
}
