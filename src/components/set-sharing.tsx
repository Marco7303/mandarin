'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, Link as LinkIcon } from 'lucide-react';
import type { Entry } from '@/lib/core';
import { getClient } from '@/lib/cloud';
import { sharingRequest } from '@/lib/sharing-client';
import { sharedDeckSchema, type SharedDeck } from '@/lib/sharing-schema';

export function ShareSet({ set, entries, owner, signedIn, onAuth }: {
    set: { id: string; name: string }; entries: Entry[]; owner: string; signedIn: boolean; onAuth: (signup: boolean) => void;
}) {
    const [share, setShare] = useState<SharedDeck | null>(null);
    const [loading, setLoading] = useState(signedIn);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [copied, setCopied] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (!signedIn) return;
        let cancelled = false;
        sharingRequest('GET', owner, `?setId=${encodeURIComponent(set.id)}`)
            .then(value => { if (!cancelled) { setShare(value); setLoaded(true); setError(''); } })
            .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load sharing.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [owner, set.id, signedIn, attempt]);
    async function publish() {
        setBusy(true); setError(''); setCopied(false); setFeedback('');
        try { setShare(await sharingRequest('POST', owner, '', { setId: set.id, name: set.name, entries })); setFeedback(share ? 'Shared version updated.' : 'Link created.'); }
        catch (e) { setError(e instanceof Error ? e.message : 'Could not create the link.'); }
        finally { setBusy(false); }
    }
    async function stop() {
        if (!share || !window.confirm('Stop sharing this set? The link will stop working. Copies already saved by others will remain.')) return;
        setBusy(true); setError(''); setFeedback('');
        try { await sharingRequest('DELETE', owner, `/${share.id}`); setShare(null); setCopied(false); setFeedback('Sharing stopped.'); }
        catch (e) { setError(e instanceof Error ? e.message : 'Could not stop sharing.'); }
        finally { setBusy(false); }
    }
    const url = share ? `${window.location.origin}/share/${share.id}` : '';
    return <div className="share-content">
        <p className="modal-intro">Anyone with the link can view the words and save their own copy. Their progress stays separate.</p>
        {!signedIn ? <><p className="modal-intro">Create an account or sign in to share this set.</p><div className="account-prompt-actions"><button className="button primary full" disabled={!getAuthAvailable()} onClick={() => onAuth(true)}>Create account</button><button className="button secondary full" disabled={!getAuthAvailable()} onClick={() => onAuth(false)}>Sign in</button></div></> : <>
            {loading ? <p role="status">Loading sharing…</p> : share ? <>
                <label className="share-link-label">Share link<input aria-label="Share link" readOnly value={url} onFocus={e => e.target.select()}/></label>
                <button className="button primary full" disabled={busy} onClick={async () => {
                    try { await navigator.clipboard.writeText(url); setCopied(true); }
                    catch { setError('Select the link above and copy it.'); }
                }}>{copied ? <Check size={17}/> : <Copy size={17}/>} {copied ? 'Copied' : 'Copy link'}</button>
                <p className="share-note">Shared version: {share.entries.length} words. Changes to your set stay private until you update this version. Notes and examples are included.</p>
                <div className="share-actions"><button className="button secondary" disabled={busy || !entries.length} onClick={() => void publish()}>{busy ? 'Saving…' : 'Update shared version'}</button><button className="text-button" disabled={busy} onClick={() => void stop()}>Stop sharing</button></div>
            </> : loaded ? <><p className="share-note">This shares the current words, including notes and examples. Your account details, folders, stars and progress stay private.</p><button className="button primary full" disabled={busy || !entries.length} onClick={() => void publish()}><LinkIcon size={17}/>{busy ? 'Creating…' : 'Create link'}</button>{!entries.length && <p className="share-note">Add words before sharing this set.</p>}</> : <button className="button secondary" onClick={() => { setLoading(true); setAttempt(n => n + 1); }}>Try again</button>}
        </>}
        {feedback && <p className="share-note" role="status">{feedback}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
    </div>;
}
const getAuthAvailable = () => !!getClient();

export function SharedSetPreview({ id, folders, existing, signedIn, canSave, onSave, onOpen, onHome }: {
    id: string; folders: { id: string; name: string }[]; existing?: { id: string; name: string };
    signedIn: boolean; canSave: boolean; onSave: (deck: SharedDeck, folderId: string) => void;
    onOpen: (id: string) => void; onHome: () => void;
}) {
    const [deck, setDeck] = useState<SharedDeck | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);
    const [folder, setFolder] = useState(folders[0]?.id || '');
    const [limit, setLimit] = useState(30);
    useEffect(() => {
        const controller = new AbortController();
        fetch(`/api/shares/${encodeURIComponent(id)}`, { cache: 'no-store', signal: controller.signal })
            .then(async response => {
                if (!response.ok) throw new Error(response.status === 404 ? 'This link is invalid or the owner has stopped sharing.' : 'Could not load this set. Please try again.');
                const parsed = sharedDeckSchema.safeParse(await response.json());
                if (!parsed.success) throw new Error('This set could not be read. Please try again.');
                return parsed.data;
            }).then(setDeck).catch(e => {
                if (!controller.signal.aborted) setError(!navigator.onLine ? 'Connect to the internet to open a shared set. Saved copies are available in your library offline.' : e instanceof Error ? e.message : 'Could not load this set.');
            }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [id, attempt]);
    if (loading) return <div className="loading" role="status">Loading shared set…</div>;
    if (error || !deck) return <section className="shared-unavailable"><h1>Set unavailable</h1><p>{error}</p><div className="heading-actions"><button className="button secondary" onClick={() => { setError(''); setLoading(true); setAttempt(n => n + 1); }}>Try again</button><button className="button primary" onClick={onHome}>Your study space</button>{existing && <button className="button secondary" onClick={() => onOpen(existing.id)}>Open your copy</button>}</div></section>;
    const selectedFolder = folders.some(f => f.id === folder) ? folder : folders[0]?.id || '';
    return <>
        <button className="back-link" onClick={onHome}><ArrowLeft size={16}/>Your study space</button>
        <div className="page-heading shared-heading"><div><div className="eyebrow">SHARED SET</div><h1>{deck.name}</h1><p>{deck.entries.length} words</p></div></div>
        <section className="shared-save" aria-label="Save shared set"><div><h2>{existing ? 'Already in your library' : 'Study your own copy'}</h2><p>{existing ? 'Your saved words and progress are separate from this shared version.' : 'Add this set to your library to study it and track your progress. Updates to this link won’t change your copy.'}</p>{!signedIn && !existing && <p>Without an account, your copy is saved only in this browser.</p>}</div><div className="shared-save-actions">{existing ? <button className="button primary" onClick={() => onOpen(existing.id)}>Open your copy<ArrowRight size={17}/></button> : <><label>Save to folder<select aria-label="Save to folder" value={selectedFolder} onChange={e => setFolder(e.target.value)}>{folders.length ? folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>) : <option value="">Shared sets</option>}</select></label><button className="button primary" disabled={!canSave} onClick={() => onSave(deck, selectedFolder)}>Add to library<ArrowRight size={17}/></button>{!canSave && <p className="share-note">Sync your library before adding this set.</p>}</>}</div></section>
        <div className="shared-word-list" aria-label="Shared words">{deck.entries.slice(0, limit).map((entry, i) => <article className="shared-word" key={i}><span className="shared-word-number">{i + 1}</span><div><span className="shared-chinese" lang="zh-Hant-TW">{entry.traditional}</span><span className="shared-pinyin">{entry.pinyin}</span></div><span className="shared-english">{entry.english}</span></article>)}</div>
        {deck.entries.length > limit && <button className="button secondary shared-more" onClick={() => setLimit(n => n + 50)}>Show more words</button>}
    </>;
}
