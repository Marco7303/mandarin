'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Folder, Search } from 'lucide-react';
import { communityPageSchema, type PublicSet } from '@/lib/community-schema';

export function Explore({ savedIds, onOpen, onLibrary }: { savedIds: string[]; onOpen: (id: string) => void; onLibrary: () => void }) {
    const [input, setInput] = useState('');
    const [query, setQuery] = useState({ q: '', cursor: '', attempt: 0, kind: '' });
    const [sets, setSets] = useState<PublicSet[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true), [error, setError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        const params = new URLSearchParams({ q: query.q });
        if (query.kind) params.set('kind', query.kind);
        if (query.cursor) params.set('cursor', query.cursor);
        fetch(`/api/community?${params}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
            if (!response.ok) throw new Error('Could not load public sets. Please try again.');
            return communityPageSchema.parse(await response.json());
        }).then(page => {
            if (controller.signal.aborted) return;
            setSets(previous => query.cursor ? [...previous, ...page.sets.filter(row => !previous.some(p => p.id === row.id))] : page.sets);
            setNextCursor(page.nextCursor);
        }).catch(error => {
            if (!controller.signal.aborted) setError(!navigator.onLine ? 'Connect to the internet to explore public sets. Your saved sets are available in your library.' : error instanceof Error ? error.message : 'Could not load public sets.');
        }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [query]);
    return <section className="explore-page">
        <div className="page-heading"><div><h1>Explore</h1><p>Find sets and folders shared by other learners.</p></div></div>
        <form className="explore-search" role="search" onSubmit={e => {
            e.preventDefault(); setLoading(true); setError(''); setSets([]); setNextCursor(null);
            setQuery({ q: input.trim(), cursor: '', attempt: query.attempt + 1, kind: query.kind });
        }}><label className="search"><Search size={19}/><input aria-label="Search public sets" placeholder="Search sets or creators" maxLength={100} value={input} onChange={e => setInput(e.target.value)}/></label><button className="button primary">Search</button></form>
        <div className="explore-filters" role="group" aria-label="Content type">{[['', 'All'], ['set', 'Sets'], ['folder', 'Folders']].map(([kind, label]) => <button className={`chip${query.kind === kind ? ' selected' : ''}`} key={kind} aria-pressed={query.kind === kind} onClick={() => { setLoading(true); setError(''); setSets([]); setNextCursor(null); setQuery(q => ({ ...q, kind, cursor: '', attempt: q.attempt + 1 })); }}>{label}</button>)}</div>
        <div className="section-heading explore-results"><h2>{query.q ? `Results for “${query.q}”` : query.kind === 'folder' ? 'Public folders' : query.kind === 'set' ? 'Public sets' : 'Public sets and folders'}</h2><span className="share-note">{query.q ? 'Matching sets' : 'Recently updated'}</span></div>
        {error && <div className="explore-empty"><p className="form-error" role="alert">{error}</p><button className="button secondary" onClick={() => { setError(''); setLoading(true); setQuery(q => ({ ...q, attempt: q.attempt + 1 })); }}>Try again</button></div>}
        {!loading && !error && !sets.length && <div className="explore-empty"><BookOpen size={28}/><h3>{query.q ? 'No matching sets' : query.kind === 'folder' ? 'No public folders yet' : 'No public sets yet'}</h3><p>{query.q ? 'Try a different title, topic or creator name.' : 'To publish a set or folder, open it in your library and choose Share, then Public.'}</p>{!query.q && <button className="button secondary" onClick={onLibrary}>Open your library<ArrowRight size={16}/></button>}</div>}
        <div className="set-grid explore-grid">{sets.map(set => <a key={set.id} className="public-set-card" href={`/share/${set.id}`} onClick={e => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault(); onOpen(set.id);
        }}><div className="public-set-top"><span className="public-word-count">{set.kind === 'folder' ? <Folder size={16}/> : <BookOpen size={16}/>}<span>{set.kind === 'folder' ? `Folder · ${set.setCount} sets · ` : ''}{set.wordCount} words</span></span>{savedIds.includes(set.id) && <span className="public-saved">In your library</span>}</div><h3>{set.name}</h3>{set.description && <p>{set.description}</p>}<div className="public-set-bottom"><span>By {set.creatorName}</span><ArrowRight size={18}/></div></a>)}</div>
        {loading && <p role="status" className="explore-loading">Loading public sets…</p>}
        {!loading && !error && nextCursor && <button className="button secondary shared-more" onClick={() => { setLoading(true); setError(''); setQuery(q => ({ ...q, cursor: nextCursor })); }}>Show more sets</button>}
    </section>;
}
