'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, Link as LinkIcon } from 'lucide-react';
import type { Entry } from '@/lib/core';
import { getClient } from '@/lib/cloud';
import { sharingRequest, communityRequest } from '@/lib/sharing-client';
import { sharedDeckSchema, sharedDeckInputSchema, MAX_SHARE_BYTES, type SharedDeck } from '@/lib/sharing-schema';
import { CharacterExplorer } from './character-explorer';

export function ShareSet({ set, entries, owner, signedIn, onAuth, collectionSets, onNameSaved }: {
    onNameSaved?: (name: string) => void;
    collectionSets?: { id: string; name: string }[];
    set: { id: string; name: string }; entries: Entry[]; owner: string; signedIn: boolean; onAuth: (signup: boolean) => void;
}) {
    const noun = collectionSets ? 'folder' : 'set';
    const kind = collectionSets ? 'folder' : 'set';
    const [share, setShare] = useState<SharedDeck | null>(null);
    const [loading, setLoading] = useState(signedIn);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [copied, setCopied] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [attempt, setAttempt] = useState(0);
    const [isPublic, setIsPublic] = useState(false);
    const [description, setDescription] = useState('');
    const [creatorName, setCreatorName] = useState('');
    useEffect(() => {
        if (!signedIn) return;
        let cancelled = false;
        Promise.all([sharingRequest('GET', owner, `?setId=${encodeURIComponent(set.id)}&kind=${kind}`), communityRequest('GET', owner, '/profile')])
            .then(([value, profile]) => { if (!cancelled) {
                setShare(value); setIsPublic(value?.isPublic || false); setDescription(value?.description || '');
                setCreatorName(value?.creatorName || profile.displayName || ''); setLoaded(true); setError('');
            } })
            .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load sharing.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [owner, set.id, signedIn, attempt, kind]);
    async function publish() {
        setBusy(true); setError(''); setCopied(false); setFeedback('');
        try {
            const input = sharedDeckInputSchema.safeParse({ setId: set.id, name: set.name, entries, isPublic, description, ...(collectionSets ? { kind, sets: collectionSets } : {}), ...(creatorName.trim() ? { creatorName: creatorName.trim() } : {}) });
            if (!input.success) throw new Error(input.error.issues[0]?.message || 'Check the sharing details.');
            if (new TextEncoder().encode(JSON.stringify(input.data)).length > MAX_SHARE_BYTES) throw new Error('This share exceeds 2 MB. Share smaller sets separately.');
            const saved = await sharingRequest('POST', owner, '', input.data);
            if (saved?.creatorName) onNameSaved?.(saved.creatorName);
            setShare(saved); setFeedback(saved?.suppressed ? `Saved. This ${noun} remains unavailable to others.` : isPublic ? 'Published in Explore.' : share ? 'Shared version updated. Only people with the link can find it.' : 'Link created.');
        }
        catch (e) { setError(e instanceof Error ? e.message : 'Could not create the link.'); }
        finally { setBusy(false); }
    }
    async function stop() {
        if (!share || !window.confirm(`Stop sharing this ${noun}? The link will stop working. Copies already saved by others will remain.`)) return;
        setBusy(true); setError(''); setFeedback('');
        try { await sharingRequest('DELETE', owner, `/${share.id}`); setShare(null); setCopied(false); setFeedback('Sharing stopped.'); }
        catch (e) { setError(e instanceof Error ? e.message : 'Could not stop sharing.'); }
        finally { setBusy(false); }
    }
    const url = share ? `${window.location.origin}/share/${share.id}` : '';
    return <div className="share-content">
        <p className="modal-intro">Share a copy of this {noun}. Other learners keep their own words and progress.</p>
        {!signedIn ? <><p className="modal-intro">Create an account or sign in to share this {noun}.</p><div className="account-prompt-actions"><button className="button primary full" disabled={!getAuthAvailable()} onClick={() => onAuth(true)}>Create account</button><button className="button secondary full" disabled={!getAuthAvailable()} onClick={() => onAuth(false)}>Sign in</button></div></> : <>
            {collectionSets && <div className="folder-share-summary"><p className="share-note">{collectionSets.length} sets · {entries.length} words. Archived sets, archived words and empty sets are excluded. Sharing this folder won’t publish separate links for its sets.</p><details><summary>Included sets</summary><ul>{collectionSets.map(item => <li key={item.id}>{item.name}<span>{entries.filter(entry => entry.setId === item.id).length} words</span></li>)}</ul></details></div>}
            {loading ? <p role="status">Loading sharing…</p> : loaded ? <>
                <fieldset className="share-visibility"><legend>Visibility</legend>
                    <label><input type="radio" name="visibility" checked={!isPublic} disabled={busy} onChange={() => setIsPublic(false)}/><span><strong>Anyone with the link</strong><small>Unlisted. Share the link yourself.</small></span></label>
                    <label><input type="radio" name="visibility" checked={isPublic} disabled={busy} onChange={() => setIsPublic(true)}/><span><strong>Public</strong><small>Listed in Explore. Anyone can find and copy it.</small></span></label>
                </fieldset>
                {isPublic && <div className="publish-fields"><label>Public name<input aria-label="Public name" maxLength={50} minLength={2} value={creatorName} disabled={busy} onChange={e => setCreatorName(e.target.value)} placeholder="Choose a name"/></label><p className="share-note">Shown on all your published sets and folders. Use a name you’re comfortable making public. Your email stays private.</p><label>Description <span className="optional-label">optional</span><textarea aria-label={collectionSets ? "Folder description" : "Set description"} maxLength={500} rows={3} value={description} disabled={busy} onChange={e => setDescription(e.target.value)} placeholder={`What does this ${noun} cover?`}/></label><p className="share-note">Publish content you have permission to share. Words, notes and examples will be public.</p></div>}
                {share ? <>
                <p className="share-note">{share.suppressed ? `This ${noun} has been removed from sharing after review.` : share.isPublic ? 'Public · Listed in Explore' : 'Unlisted · Only accessible with the link'}</p>
                <label className="share-link-label">Share link<input aria-label="Share link" readOnly value={url} onFocus={e => e.target.select()}/></label>
                <button className="button primary full" disabled={busy} onClick={async () => {
                    try { await navigator.clipboard.writeText(url); setCopied(true); }
                    catch { setError('Select the link above and copy it.'); }
                }}>{copied ? <Check size={17}/> : <Copy size={17}/>} {copied ? 'Copied' : 'Copy link'}</button>
                <p className="share-note">Shared version: {share.kind === 'folder' ? `${share.sets.length} sets · ` : ''}{share.entries.length} words. Changes to your {noun} stay private until you update this version. Notes and examples are included.</p>
                <div className="share-actions"><button className="button secondary" disabled={busy || !entries.length || (isPublic && creatorName.trim().length < 2)} onClick={() => void publish()}>{busy ? 'Saving…' : isPublic !== share.isPublic ? isPublic ? `Publish ${noun}` : 'Save as unlisted' : 'Update shared version'}</button><button className="text-button" disabled={busy} onClick={() => void stop()}>Stop sharing</button></div>
            </> : <><p className="share-note">Your account details, other folders, stars and progress stay private.</p><button className="button primary full" disabled={busy || !entries.length || (isPublic && creatorName.trim().length < 2)} onClick={() => void publish()}><LinkIcon size={17}/>{busy ? 'Saving…' : isPublic ? `Publish ${noun}` : 'Create link'}</button>{!entries.length && <p className="share-note">Add words before sharing this {noun}.</p>}</>}
            </> : <button className="button secondary" onClick={() => { setLoading(true); setAttempt(n => n + 1); }}>Try again</button>}
        </>}
        {feedback && <p className="share-note" role="status">{feedback}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
    </div>;
}
const getAuthAvailable = () => !!getClient();

export function SharedSetPreview({ id, folders, existing, signedIn, canSave, onSave, onOpen, onHome, owner, onAuth, backToExplore }: {
    id: string; folders: { id: string; name: string }[]; existing?: { id: string; name: string };
    signedIn: boolean; canSave: boolean; onSave: (deck: SharedDeck, folderId: string) => void;
    onOpen: (id: string) => void; onHome: () => void;
    owner: string; onAuth: () => void; backToExplore: boolean;
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
    const isFolder = deck.kind === 'folder';
    const noun = isFolder ? 'folder' : 'set';
    const selectedFolder = folders.some(f => f.id === folder) ? folder : folders[0]?.id || '';
    return <>
        <button className="back-link" onClick={onHome}><ArrowLeft size={16}/>{backToExplore ? 'Explore' : 'Your study space'}</button>
        <div className="page-heading shared-heading"><div><div className="eyebrow">{deck.isPublic ? `PUBLIC ${noun.toUpperCase()}` : `SHARED ${noun.toUpperCase()}`}</div><h1>{deck.name}</h1><p>{isFolder ? `${deck.sets.length} sets · ` : ''}{deck.entries.length} words{deck.isPublic && deck.creatorName ? ` · By ${deck.creatorName}` : ''}</p>{deck.isPublic && deck.description && <p className="public-description">{deck.description}</p>}</div></div>
        <section className="shared-save" aria-label={`Save shared ${noun}`}><div><h2>{existing ? 'Already in your library' : isFolder ? 'Save the whole folder' : 'Study your own copy'}</h2><p>{existing ? 'Your saved words and progress are separate from this shared version.' : 'Add this to your library to study it and track your progress. Updates to this link won’t change your copy.'}</p>{!signedIn && !existing && <p>Without an account, your copy is saved only in this browser.</p>}</div><div className="shared-save-actions">{existing ? <button className="button primary" onClick={() => onOpen(existing.id)}>Open your copy<ArrowRight size={17}/></button> : <>{isFolder ? <p className="share-note">Creates a new folder with all {deck.sets.length} sets.</p> : <label>Save to folder<select aria-label="Save to folder" value={selectedFolder} onChange={e => setFolder(e.target.value)}>{folders.length ? folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>) : <option value="">Shared sets</option>}</select></label>}<button className="button primary" disabled={!canSave} onClick={() => onSave(deck, selectedFolder)}>{isFolder ? 'Add folder to library' : 'Add to library'}<ArrowRight size={17}/></button>{!canSave && <p className="share-note">Sync your library before adding this {noun}.</p>}</>}</div></section>
        {isFolder ? <section className="shared-folder-sets" aria-label="Sets in this folder">{deck.sets.map(set => <SharedFolderSet key={set.id} name={set.name} entries={deck.entries.filter(entry => entry.setId === set.id)}/>)}</section> : <><SharedWords entries={deck.entries.slice(0, limit)}/>{deck.entries.length > limit && <button className="button secondary shared-more" onClick={() => setLimit(n => n + 50)}>Show more words</button>}</>}

        {deck.isPublic && <ReportSet key={id} noun={noun} id={id} owner={owner} signedIn={signedIn} onAuth={onAuth}/>}
    </>;
}

function ReportSet({ id, owner, signedIn, onAuth, noun = 'set' }: { noun?: string; id: string; owner: string; signedIn: boolean; onAuth: () => void }) {
    const [open, setOpen] = useState(false), [reason, setReason] = useState('Inaccurate content');
    const [details, setDetails] = useState(''), [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState('');
    return <div className="report-set">{sent ? <p role="status">Report received.</p> : <><button className="text-button" aria-expanded={open} onClick={() => setOpen(v => !v)}>Report this {noun}</button>{open && (!signedIn ? <p>Sign in to report a {noun}. <button className="text-button" onClick={onAuth}>Sign in</button></p> : <form onSubmit={async e => {
        e.preventDefault(); setBusy(true); setError('');
        try { await communityRequest('POST', owner, `/${id}/report`, { reason, details }); setSent(true); }
        catch (error) { setError(error instanceof Error ? error.message : 'Could not send report.'); }
        finally { setBusy(false); }
    }}><label>Reason<select value={reason} onChange={e => setReason(e.target.value)}>{['Inaccurate content', 'Inappropriate content', 'Copyright or spam'].map(value => <option key={value}>{value}</option>)}</select></label><label>Details <span className="optional-label">optional</span><textarea maxLength={500} rows={3} value={details} onChange={e => setDetails(e.target.value)}/></label><button className="button secondary" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button>{error && <p role="alert" className="form-error">{error}</p>}</form>)}</>}</div>;
}

function SharedFolderSet({ name, entries }: { name: string; entries: SharedDeck['entries'] }) {
    const [limit, setLimit] = useState(30), [open, setOpen] = useState(false);
    return <details className="shared-folder-set" onToggle={event => setOpen(event.currentTarget.open)}><summary><span>{name}</span><small>{entries.length} words</small></summary>{open && <><SharedWords entries={entries.slice(0, limit)}/>{entries.length > limit && <button className="button secondary shared-more" onClick={() => setLimit(n => n + 50)}>Show more words</button>}</>}</details>;
}
function SharedWords({ entries }: { entries: SharedDeck['entries'] }) {
    return <div className="shared-word-list" aria-label="Shared words">{entries.map((entry, i) => <article className="shared-word" key={entry.id}><span className="shared-word-number">{i + 1}</span><div><span className="shared-chinese" lang="zh-Hant-TW">{entry.traditional}</span><span className="shared-pinyin">{entry.pinyin}</span></div><span className="shared-english">{entry.english}</span><div className="shared-word-details"><CharacterExplorer word={entry.traditional}/></div></article>)}</div>;
}
