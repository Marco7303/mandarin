'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronRight, Folder as FolderIcon, Home, Leaf, MoreHorizontal, Plus, Search, Settings, Sparkles, Star, Upload, X, RotateCcw, WifiOff, Cloud, Archive, Pencil, Copy, Trash2, Share2, Compass } from 'lucide-react';
import seed from '@/data/unit1.json';
import { CharacterExplorer } from './character-explorer';
import { ShareSet, SharedSetPreview } from './set-sharing';
import { Explore } from './explore';
import type { SharedDeck } from '@/lib/sharing-schema';
import { buildQueue, isLearned, makeEntry, normalizeStudyPreferences, recordAnswer, resetProgress, searchEntry, type Entry, type Direction, type Progress } from '@/lib/core';
import { parseFile, parseText, exportCSV, validateEntries, type ImportResult } from '@/lib/importer';
import { getClient, getSession, onAuthStateChange, getCloudRevision, loadCloud, saveCloud, signIn, signUp, signOut } from '@/lib/cloud';
type Folder = {
    sourceShareId?: string;
    id: string;
    name: string;
    archived?: boolean;
};
type Set = {
    sourceShareId?: string;
    id: string;
    folderId: string;
    name: string;
    archived?: boolean;
};
type Preferences = {
    prompt: Direction | 'mixed';
    filter: string;
    order: string;
    amount: string;
};
type State = {
    folders: Folder[];
    sets: Set[];
    entries: Entry[];
    progress: Record<string, Progress>;
    stars: Record<string, boolean>;
    preferences: Preferences;
};
type Screen = 'home' | 'sets' | 'detail' | 'setup' | 'session' | 'result' | 'settings' | 'shared' | 'explore';
type Prompt = {
    entryId: string;
    direction: Direction;
};
type Modal = 'folder' | 'set' | 'entry' | 'import' | 'auth' | 'save-set' | 'share' | null;
const directions: Direction[] = ['chinese', 'pinyin', 'english'];
const labels = { chinese: 'Chinese', pinyin: 'Pinyin', english: 'English', mixed: 'Mixed' };
const defaultPreferences: Preferences = { prompt: 'chinese', filter: 'Learning', order: 'Original', amount: '20' };
const initialState: State = { folders: [{ id: 'mandarin-class', name: 'Mandarin Class' }], sets: [{ id: 'unit-1', folderId: 'mandarin-class', name: 'Unit 1' }], entries: seed as Entry[], progress: {}, stars: {}, preferences: defaultPreferences };
const key = (id: string, d: Direction) => `${id}:${d}`;
const uid = () => crypto.randomUUID();
const cn = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');
const today = () => new Date().toISOString().slice(0, 10);
export default function MandarinApp({ shareId }: { shareId?: string }) {
    const [incomingShareId, setIncomingShareId] = useState(shareId || '');
    const [sharingSetId, setSharingSetId] = useState('');
    const [sharingFolderId, setSharingFolderId] = useState('');
    const [sharedFromExplore, setSharedFromExplore] = useState(false);
    const [data, setData] = useState<State>(initialState);
    const [ready, setReady] = useState(false);
    const [screen, setScreen] = useState<Screen>('home');
    const [selectedSets, setSelectedSets] = useState<string[]>(['unit-1']);
    const [activeFolder, setActiveFolder] = useState('all');
    const [query, setQuery] = useState('');
    const [modal, setModal] = useState<Modal>(null);
    const [editing, setEditing] = useState<string | null>(null);
    const [menu, setMenu] = useState<string | null>(null);
    const [toast, setToast] = useState('');
    const [online, setOnline] = useState(true);
    const [email, setEmail] = useState('');
    const [syncStatus, setSyncStatus] = useState('Saved on this device');
    const [queue, setQueue] = useState<Prompt[]>([]);
    const [index, setIndex] = useState(0);
    const [revealed, setRevealed] = useState(false);
    const [answers, setAnswers] = useState<{
        prompt: Prompt;
        correct: boolean;
        previous?: Progress;
    }[]>([]);
    const [sessionTotal, setSessionTotal] = useState(0);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [importBusy, setImportBusy] = useState(false);
    const [importText, setImportText] = useState('');
    const [importSource, setImportSource] = useState<File | string | null>(null);
    const [destination, setDestination] = useState('unit-1');
    const [importName, setImportName] = useState('Imported set');
    const [importFolder, setImportFolder] = useState('mandarin-class');
    const [authError, setAuthError] = useState('');
    const [authBusy, setAuthBusy] = useState(false);
    const [preferSignUp, setPreferSignUp] = useState(false);
    const pendingCreateSet = useRef(false);
    const [showArchived, setShowArchived] = useState(false);
    const [storageError, setStorageError] = useState(false);
    const touchStart = useRef<number | null>(null);
    const syncReady = useRef(false);
    const dataRef = useRef(data);
    const fileRef = useRef<HTMLInputElement>(null);
    const focusBeforeModal = useRef<HTMLElement | null>(null);
    useEffect(() => { if (!modal)
        focusBeforeModal.current?.focus(); }, [modal]);
    const libraryMeta = useRef({ owner: 'guest', pending: false, baseRevision: null as number | null, syncedJSON: JSON.stringify(initialState) });
    const hydration = useRef<State | null>(null);
    const generation = useRef(0);
    const syncing = useRef(false);
    const [syncTick, setSyncTick] = useState(0);
    const [syncConflict, setSyncConflict] = useState<{
        state: State | null;
        revision: number | null;
    } | null>(null);
    const persistLocal = useCallback((state: State) => { const meta = libraryMeta.current; try {
        localStorage.setItem(`mori-v2:${meta.owner}`, JSON.stringify({ state, pending: meta.pending, baseRevision: meta.baseRevision }));
    }
    catch {
        setStorageError(true);
    } }, []);
    const switchLibrary = useCallback((owner: string) => {
        generation.current++;
        syncReady.current = false;
        syncing.current = false;
        setSyncConflict(null);
        let state: State = { ...initialState }, pending = false, baseRevision: number | null = null;
        try {
            const saved = localStorage.getItem(`mori-v2:${owner}`);
            const legacy = owner === 'guest' ? localStorage.getItem('mori-v1') : null;
            const parsed = saved ? JSON.parse(saved) : legacy ? { state: JSON.parse(legacy), pending: false, baseRevision: null } : null;
            if (parsed && Array.isArray(parsed.state?.entries) && Array.isArray(parsed.state?.folders) && Array.isArray(parsed.state?.sets)) {
                state = { ...initialState, ...parsed.state, preferences: normalizeStudyPreferences({ ...defaultPreferences, ...parsed.state.preferences }) };
                pending = !!parsed.pending;
                baseRevision = parsed.baseRevision ?? null;
            }
        }
        catch {
            setStorageError(true);
        }
        libraryMeta.current = { owner, pending, baseRevision, syncedJSON: pending ? '' : JSON.stringify(state) };
        hydration.current = state;
        dataRef.current = state;
        setData(state);
        setSelectedSets(state.sets[0] ? [state.sets[0].id] : []);
        setQueue([]);
        setAnswers([]);
        const linkId = window.location.pathname.match(/^\/share\/([^/]+)\/?$/)?.[1];
        if (linkId) setIncomingShareId(linkId);
        setScreen(linkId ? 'shared' : window.location.pathname.replace(/\/$/, '') === '/explore' ? 'explore' : 'home');
        setModal(null);
        setReady(true);
        return state;
    }, []);
    useEffect(() => { let cancelled = false; const initialize = async () => { try {
        const session = await getSession();
        if (cancelled)
            return;
        const cached = !navigator.onLine ? JSON.parse(localStorage.getItem('mori-last-owner') || 'null') : null;
        const owner = session?.user.id || cached?.id || 'guest';
        switchLibrary(owner);
        setEmail(session?.user.email || cached?.email || '');
        if (session) {
            try {
                localStorage.setItem('mori-last-owner', JSON.stringify({ id: session.user.id, email: session.user.email || '' }));
            }
            catch {
                setStorageError(true);
            }
        }
    }
    catch {
        if (!cancelled) {
            try {
                const cached = !navigator.onLine ? JSON.parse(localStorage.getItem('mori-last-owner') || 'null') : null;
                switchLibrary(cached?.id || 'guest');
                setEmail(cached?.email || '');
            }
            catch {
                switchLibrary('guest');
            }
        }
    } }; void initialize(); setOnline(navigator.onLine); if ('serviceWorker' in navigator)
        navigator.serviceWorker.register('/sw.js').catch(() => { }); const on = () => setOnline(true), off = () => setOnline(false); window.addEventListener('online', on); window.addEventListener('offline', off); return () => { cancelled = true; window.removeEventListener('online', on); window.removeEventListener('offline', off); }; }, [switchLibrary]);
    useEffect(() => { if (!ready)
        return; if (hydration.current && data !== hydration.current)
        return; hydration.current = null; dataRef.current = data; libraryMeta.current.pending = JSON.stringify(data) !== libraryMeta.current.syncedJSON; persistLocal(data); }, [data, ready, persistLocal]);
    useEffect(() => { if (!toast)
        return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
    const connectCloud = useCallback(async () => {
        let token = generation.current;
        try {
            const client = getClient();
            if (!client)
                return;
            const session = await getSession();
            if (token !== generation.current) return;
            if (!session && !navigator.onLine) {
                setSyncStatus('Saved locally · sync pending');
                return;
            }
            const owner = session?.user.id || 'guest';
            if (libraryMeta.current.owner !== owner)
                switchLibrary(owner);
            setEmail(session?.user.email || '');
            if (session) {
                try {
                    localStorage.setItem('mori-last-owner', JSON.stringify({ id: session.user.id, email: session.user.email || '' }));
                }
                catch {
                    setStorageError(true);
                }
            }
            if (!session) {
                syncReady.current = false;
                setSyncStatus('Saved on this device');
                return;
            }
            token = generation.current;
            setSyncStatus('Syncing…');
            const remote = await loadCloud(owner);
            if (token !== generation.current)
                return;
            const meta = libraryMeta.current;
            const remoteState = remote?.state as State | undefined;
            if (meta.pending && meta.baseRevision !== (remote?.revision ?? null)) {
                syncReady.current = false;
                setSyncConflict({ state: remoteState || null, revision: remote?.revision ?? null });
                setSyncStatus('Two copies · choose in Settings');
                return;
            }
            if (!meta.pending && remoteState) {
                const next = { ...initialState, ...remoteState, preferences: normalizeStudyPreferences({ ...defaultPreferences, ...remoteState.preferences }) };
                meta.baseRevision = remote!.revision;
                meta.syncedJSON = JSON.stringify(next);
                meta.pending = false;
                hydration.current = next;
                dataRef.current = next;
                setData(next);
                persistLocal(next);
            }
            else if (!remoteState) {
                meta.pending = true;
                meta.syncedJSON = '';
                persistLocal(dataRef.current);
            }
            syncReady.current = true;
            setSyncStatus(meta.pending ? 'Saved locally · sync pending' : 'Synced');
            setSyncTick(n => n + 1);
        }
        catch (e) {
            if (token !== generation.current) return;
            syncReady.current = false;
            setSyncStatus('Saved locally · sync pending');
            setToast(e instanceof Error ? e.message : 'Could not sync');
        }
    }, [persistLocal, switchLibrary]);
    useEffect(() => { if (!ready)
        return; const unsubscribe = onAuthStateChange((event, session) => { if (event === 'SIGNED_OUT') {
        try {
            localStorage.removeItem('mori-last-owner');
        }
        catch { }
        switchLibrary('guest');
        setEmail('');
        setSyncStatus('Saved on this device');
    }
    else if (event === 'SIGNED_IN' && session)
        setTimeout(() => void connectCloud(), 0); }); return unsubscribe; }, [ready, connectCloud, switchLibrary]);
    useEffect(() => { if (ready && online)
        void connectCloud(); const refresh = () => { if (navigator.onLine) void connectCloud(); }; window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, [ready, online, connectCloud]);
    useEffect(() => {
        if (!ready || !email || !online || !syncReady.current || syncConflict)
            return;
        const timer = setTimeout(async () => {
            if (syncing.current || !libraryMeta.current.pending)
                return;
            const token = generation.current;
            const owner = libraryMeta.current.owner;
            const snapshot = dataRef.current;
            const serialized = JSON.stringify(snapshot);
            const expectedRevision = libraryMeta.current.baseRevision;
            syncing.current = true;
            setSyncStatus('Syncing…');
            try {
                await saveCloud(snapshot, { userId: owner, expectedRevision });
                if (token !== generation.current)
                    return;
                const meta = libraryMeta.current;
                meta.baseRevision = getCloudRevision(owner);
                meta.syncedJSON = serialized;
                meta.pending = JSON.stringify(dataRef.current) !== serialized;
                persistLocal(dataRef.current);
                setSyncStatus(meta.pending ? 'Saved locally · sync pending' : 'Synced');
            }
            catch (e) {
                if (token !== generation.current)
                    return;
                syncReady.current = false;
                setSyncStatus('Saved locally · sync pending');
                if (e instanceof Error && /cloud library changed/.test(e.message))
                    void connectCloud();
            }
            finally {
                if (token === generation.current) {
                    syncing.current = false;
                    if (libraryMeta.current.pending && syncReady.current)
                        setSyncTick(n => n + 1);
                }
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [data, email, online, ready, syncTick, syncConflict, persistLocal, connectCloud]);
    useEffect(() => {
        if (!email || authBusy || !syncReady.current || !pendingCreateSet.current) return;
        pendingCreateSet.current = false;
        setEditing(null);
        setModal('set');
    }, [email, authBusy, syncTick]);
    async function resolveSync(keepDevice: boolean) {
        if (!syncConflict)
            return;
        const token = generation.current;
        const meta = libraryMeta.current;
        if (keepDevice) {
            const snapshot = dataRef.current;
            const serialized = JSON.stringify(snapshot);
            try {
                await saveCloud(snapshot, { userId: meta.owner, expectedRevision: syncConflict.revision });
                if (token !== generation.current)
                    return;
                meta.baseRevision = getCloudRevision(meta.owner);
                meta.syncedJSON = serialized;
                meta.pending = JSON.stringify(dataRef.current) !== serialized;
                persistLocal(dataRef.current);
                setSyncConflict(null);
                syncReady.current = true;
                setSyncTick(n => n + 1);
                setSyncStatus(meta.pending ? 'Saved locally · sync pending' : 'Synced');
            }
            catch (e) {
                setToast(e instanceof Error ? e.message : 'Could not sync');
            }
        }
        else {
            const next = syncConflict.state ? { ...initialState, ...syncConflict.state, preferences: normalizeStudyPreferences({ ...defaultPreferences, ...syncConflict.state.preferences }) } : initialState;
            meta.baseRevision = syncConflict.revision;
            meta.syncedJSON = JSON.stringify(next);
            meta.pending = false;
            hydration.current = next;
            dataRef.current = next;
            setData(next);
            persistLocal(next);
            setSyncConflict(null);
            syncReady.current = true;
            setSyncStatus('Synced');
        }
    }
    const entries = data.entries.filter(e => !e.archived);
    const activeSets=data.sets.filter(s=>!s.archived&&!data.folders.find(f=>f.id===s.folderId)?.archived);
    const sets = data.sets.filter(s => showArchived ? (!!s.archived || !!data.folders.find(f => f.id === s.folderId)?.archived) : !s.archived && !data.folders.find(f => f.id === s.folderId)?.archived);
    const folders = data.folders.filter(f => !f.archived);
    const selectedEntries = entries.filter(e => selectedSets.includes(e.setId));
    const activeSet = data.sets.find(s => s.id === selectedSets[0]);
    const current = queue[index];
    const currentEntry = entries.find(e => e.id === current?.entryId);
    const reviewedToday = Object.values(data.progress).filter(p => p.lastReviewed?.slice(0, 10) === today()).length;
    const learned = entries.filter(e => directions.some(d => isLearned(data.progress[key(e.id, d)]))).length;
    const learning = entries.filter(e => activeSets.some(s => s.id === e.setId) && (data.preferences.prompt === 'mixed' ? directions.some(d => !isLearned(data.progress[key(e.id, d)])) : !isLearned(data.progress[key(e.id, data.preferences.prompt)]))).length;
    const starred = Object.values(data.stars).filter(Boolean).length;
    const notify = (message: string) => setToast(message);
    const update = (fn: (previous: State) => State) => setData(fn);
    function navigate(next: Screen) { if (next !== 'shared') window.history.replaceState(null, '', next === 'explore' ? '/explore' : '/'); setScreen(next); setMenu(null); setQuery(''); window.scrollTo(0, 0); }
    function openSet(id: string) { setSelectedSets([id]); navigate('detail'); }
    function setup(ids = selectedSets, filter = 'Learning') { setSelectedSets(ids);
        update(d => ({ ...d, preferences: { ...d.preferences, filter, ...(filter === 'Starred' ? { prompt: 'mixed' as const } : {}) } })); navigate('setup'); }
    function startSession(only?: Prompt[]) {
        const pref = data.preferences;
        const prompts: Prompt[] = only || buildQueue(selectedEntries, data.progress, data.stars, {
            prompt: pref.prompt,
            cards: pref.filter.toLowerCase() as 'learning' | 'learned' | 'all' | 'starred',
            order: pref.order === 'Random' ? 'random' : 'original',
            amount: pref.amount === 'All' ? 'all' : Number(pref.amount),
        });
        if (!prompts.length) {
            notify(pref.filter === 'Learning' ? 'All learned for this front! Choose Learned or All to practise again.' : 'No cards match. Try a different filter.');
            return;
        }
        setQueue(prompts);
        setSessionTotal(prompts.length);
        setIndex(0);
        setAnswers([]);
        setRevealed(false);

        navigate('session');
    }
    const toggleAnswer = useCallback(() => { setRevealed(value => !value);  }, []);
    const answer = useCallback((correct: boolean) => { if (!current || !revealed)
        return; const id = key(current.entryId, current.direction); const previous = data.progress[id]; setData(d => ({ ...d, progress: { ...d.progress, [id]: recordAnswer(previous, correct) } })); setAnswers(a => [...a, { prompt: current, correct, previous }]);
        if (index + 1 >= queue.length) setScreen('result');
        else setIndex(i => i + 1);
        setRevealed(false);  }, [current, revealed, data.progress, queue.length, index]);
    function undo() { const last = answers[answers.length - 1]; if (!last) return;
        const id = key(last.prompt.entryId, last.prompt.direction);
        update(d => { const progress = { ...d.progress }; if (last.previous) progress[id] = last.previous; else delete progress[id]; return { ...d, progress }; });
        setAnswers(a => a.slice(0, -1)); setIndex(Math.max(0, answers.length - 1)); setRevealed(true); setScreen('session');
    }
    function moveToLearning(entryId: string) {
        update(d => ({ ...d, progress: resetProgress(d.progress, [entryId]) })); notify('Word moved back to Learning for all fronts');
    }
    function resetSet(setId: string) {
        if (!window.confirm('Reset this set’s progress? All its cards will move back to Learning. Your words and stars will stay.')) return;
        update(d => ({ ...d, progress: resetProgress(d.progress, d.entries.filter(e => e.setId === setId).map(e => e.id)) }));
        setMenu(null); notify('Set moved back to Learning');
    }
    useEffect(() => { if (screen !== 'session' || modal)
        return; const handler = (e: KeyboardEvent) => { if (e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
        return; if (e.code === 'Space') {
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        toggleAnswer();
    } if (e.code === 'ArrowLeft')
        answer(false); if (e.code === 'ArrowRight')
        answer(true); }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, [screen, modal, answer, toggleAnswer]);
    function toggleStar(id: string, d: Direction) { update(s => ({ ...s, stars: { ...s.stars, [key(id, d)]: !s.stars[key(id, d)] } })); }
    function exportEntries(list: Entry[], name: string) { const blob = new Blob([exportCSV(list)], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(url); setMenu(null); }
    function duplicateSet(s: Set) { const id = uid(); update(d => ({ ...d, sets: [...d.sets, { ...s, sourceShareId: undefined, id, name: `${s.name} copy` }], entries: [...d.entries, ...entries.filter(e => e.setId === s.id).map(e => ({ ...e, id: uid(), setId: id }))] })); setMenu(null); notify('Set duplicated'); }
    function openShare(setId: string) { setSharingFolderId(''); setSharingSetId(setId); setMenu(null); setModal('share'); }
    function openFolderShare(folderId: string) { setSharingSetId(''); setSharingFolderId(folderId); setMenu(null); setModal('share'); }
    function openSharedFolder(id: string) {
        update(d => ({ ...d, folders: d.folders.map(f => f.id === id ? { ...f, archived: false } : f) }));
        setActiveFolder(id); setShowArchived(false); navigate('sets');
    }
    function saveSharedSet(deck: SharedDeck, folderId: string) {
        const current = dataRef.current;
        if (email && (!syncReady.current || syncConflict)) { notify('Sync your library before adding this set.'); return; }
        if (deck.kind === 'folder') {
            const existing = current.folders.find(f => f.sourceShareId === deck.id);
            if (existing) { openSharedFolder(existing.id); return; }
            if (current.folders.length >= 500 || current.sets.length + deck.sets.length > 2000 || current.entries.length + deck.entries.length > 20000) {
                notify('Your library is full. Remove unused folders or sets before adding this one.'); return;
            }
            const folderId = uid();
            const setIds = new Map(deck.sets.map(set => [set.id, uid()]));
            const copied = deck.entries.map(entry => ({ ...entry, id: uid(), setId: setIds.get(entry.setId)! }));
            update(d => ({ ...d,
                folders: [...d.folders, { id: folderId, name: deck.name, sourceShareId: deck.id }],
                sets: [...d.sets, ...deck.sets.map(set => ({ id: setIds.get(set.id)!, name: set.name, folderId }))],
                entries: [...d.entries, ...copied],
            }));
            setActiveFolder(folderId); setShowArchived(false); navigate('sets'); notify('Folder added to your library'); return;
        }
        const existing = current.sets.find(s => s.sourceShareId === deck.id);
        if (existing) { openSet(existing.id); return; }
        if (current.entries.length + deck.entries.length > 20000 || current.sets.length >= 2000) {
            notify('Your library is full. Remove unused sets before adding this one.'); return;
        }
        const folder = current.folders.find(f => f.id === folderId && !f.archived);
        if (!folder && current.folders.length >= 500) { notify('Your library has too many folders. Restore a folder first.'); return; }
        const targetFolder = folder?.id || uid(), setId = uid();
        const copied = deck.entries.map(entry => makeEntry({ ...entry, id: uid(), setId }, setId));
        update(d => ({ ...d,
            folders: folder ? d.folders : [...d.folders, { id: targetFolder, name: 'Shared sets' }],
            sets: [...d.sets, { id: setId, name: deck.name, folderId: targetFolder, sourceShareId: deck.id }],
            entries: [...d.entries, ...copied],
        }));
        setActiveFolder(targetFolder); openSet(setId); notify('Set added to your library');
    }
    function editEntry(entry?: Entry) { setEditing(entry?.id || null); setModal('entry'); }
    async function readImport(file: File) { setImportSource(file); setImportBusy(true); try {
        setImportResult(await parseFile(file));
        setImportName(file.name.replace(/\.[^.]+$/, ''));
    }
    catch (e) {
        notify(e instanceof Error ? e.message : 'Could not read file');
    }
    finally {
        setImportBusy(false);
    } }
    const closeModal = () => { pendingCreateSet.current = false; setModal(null); setEditing(null); setAuthError(''); };
    function createSet() { setEditing(null); setModal(email ? 'set' : 'save-set'); }
    function openAuth(signup = false, resumeSet = false) {
        pendingCreateSet.current = resumeSet;
        setPreferSignUp(signup); setAuthError(''); setModal('auth');
    }
    const sharingSet = data.sets.find(s => s.id === sharingSetId);
    const sharingFolder = folders.find(f => f.id === sharingFolderId);
    const folderSharingSets = activeSets.filter(s => s.folderId === sharingFolderId && entries.some(e => e.setId === s.id));
    const sharedFolderCopy = data.folders.find(f => f.sourceShareId === incomingShareId);
    const sharedCopy = data.sets.find(s => s.sourceShareId === incomingShareId);
    const visibleSets = sets.filter(s => (activeFolder === 'all' || s.folderId === activeFolder) && (!query || s.name.toLowerCase().includes(query.toLowerCase()) || entries.some(e => e.setId === s.id && searchEntry(e, query))));
    const isStudy = screen === 'session' || screen === 'result';
    return <div className="app-shell" onFocusCapture={e => { if (!modal)
        focusBeforeModal.current = e.target as HTMLElement; }}>
    <a className="skip-link" href="#main-content">Skip to content</a><aside className={cn('sidebar', isStudy && 'study-sidebar')}>
      <a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('home'); }}><span className="brand-mark" lang="zh-Hant-TW">森</span><span>mori<span className="brand-dot">.</span></span></a>
      <span className="sidebar-caption">MANDARIN FLASHCARDS</span>
      <nav aria-label="Main navigation">{([{ id: 'home', label: 'Home', icon: Home }, { id: 'setup', label: 'Study', icon: Sparkles }, { id: 'explore', label: 'Explore', icon: Compass }] as const).map(item => <button key={item.id} className={cn('nav-item', (screen === item.id || (item.id === 'setup' && isStudy)) && 'active')} onClick={() => item.id === 'setup' ? setup(activeSets.map(s => s.id)) : navigate(item.id)}><item.icon size={20}/>{item.label}</button>)}</nav>
      <nav className="sidebar-library" aria-label="Library"><div className="section-eyebrow">LIBRARY <button aria-label="Create folder" onClick={() => { setEditing(null); setModal('folder'); }}><Plus size={16}/></button></div><button className={cn('nav-item', screen === 'sets' && activeFolder === 'all' && 'active')} aria-current={screen === 'sets' && activeFolder === 'all' ? 'page' : undefined} onClick={() => { setActiveFolder('all'); navigate('sets'); }}><BookOpen size={20}/>All sets<span className="nav-count">{activeSets.length}</span></button>{folders.map(folder => <button className={cn('nav-item', 'folder-link', ((screen === 'sets' && activeFolder === folder.id) || (screen === 'detail' && activeSet?.folderId === folder.id)) && 'active')} aria-current={screen === 'sets' && activeFolder === folder.id ? 'page' : undefined} key={folder.id} onClick={() => { setActiveFolder(folder.id); navigate('sets'); }}><FolderIcon size={17}/><span>{folder.name}</span></button>)}</nav>
      <div className="sidebar-bottom"><button className={cn('nav-item', screen === 'settings' && 'active')} onClick={() => navigate('settings')}><Settings size={19}/>Settings</button><button className="profile" aria-label="Account" onClick={() => openAuth()}><span className="avatar">{email ? email[0].toUpperCase() : '學'}</span><span><strong>{email ? email.split('@')[0] : 'Account'}</strong><small>{email ? 'Personal account' : 'Not signed in'}</small></span><ChevronRight size={16}/></button></div>
    </aside>
    <div className="main-wrap">
      <header className="topbar"><span className="topbar-brand" lang="zh-Hant-TW" aria-hidden="true">森</span><button className="sync-indicator" onClick={() => navigate('settings')}>{online ? <span className="status-dot"/> : <WifiOff size={14}/>}<span>{online ? syncStatus : 'Offline · saved on device'}</span></button></header>
      {!online && <div className="offline-banner"><WifiOff size={15}/>Offline. Progress is saved on this device.</div>}
      {storageError && <div className="offline-banner">Device storage is unavailable. Export your vocabulary before leaving.</div>}
      <main id="main-content" className={cn('main', isStudy && 'session-main')}>
      {ready && !email && !isStudy && <section className="guest-notice" aria-label="Browser-only storage"><div><strong>Saved only in this browser</strong><p>Clearing browser data will delete your sets and progress.</p></div>{getClient() && <button className="button primary small" onClick={() => openAuth(true)}>Create account</button>}</section>}
      {!ready ? <div className="loading"><Leaf className="loading-leaf"/>Loading…</div> : <>
      {(screen === 'explore' || (screen === 'shared' && sharedFromExplore)) && <div hidden={screen !== 'explore'}><Explore savedIds={[...data.folders.filter(f => !f.archived).flatMap(f => f.sourceShareId ? [f.sourceShareId] : []), ...data.sets.filter(s => !s.archived && !data.folders.find(f => f.id === s.folderId)?.archived).flatMap(s => s.sourceShareId ? [s.sourceShareId] : [])]} onOpen={id => { setIncomingShareId(id); setSharedFromExplore(true); window.history.replaceState(null, '', `/share/${id}`); navigate('shared'); }} onLibrary={() => { setActiveFolder('all'); navigate('sets'); }}/></div>}
      {screen === 'shared' && incomingShareId && <SharedSetPreview key={`${incomingShareId}:${libraryMeta.current.owner}`} id={incomingShareId} folders={folders} existing={sharedFolderCopy || sharedCopy} signedIn={!!email} canSave={!email || (syncReady.current && !syncConflict)} onSave={saveSharedSet} onOpen={id => { if (sharedFolderCopy) { openSharedFolder(id); return; } if (sharedCopy?.archived || data.folders.find(f => f.id === sharedCopy?.folderId)?.archived) { update(d => ({ ...d, sets: d.sets.map(s => s.id === id ? { ...s, archived: false } : s), folders: d.folders.map(f => f.id === sharedCopy?.folderId ? { ...f, archived: false } : f) })); } openSet(id); }} owner={libraryMeta.current.owner} onAuth={() => openAuth(false)} backToExplore={sharedFromExplore} onHome={() => navigate(sharedFromExplore ? 'explore' : 'home')}/>}
      {screen === 'home' && <>
        <div className="page-heading"><div><h1>Your study space</h1></div><span className="date-label">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', weekday: 'short' })}</span></div>
        <section className="daily-card"><div className="daily-copy"><h2>Study cards</h2><p>{learning > 0 ? `${learning} words in Learning · ${labels[data.preferences.prompt]}` : 'All cards learned for the selected front.'}</p><button className="button primary" onClick={() => setup(activeSets.map(s => s.id), 'Learning')}>Study cards <ArrowRight size={18}/></button></div><div className="daily-character" aria-hidden="true"><span lang="zh-Hant-TW">學</span><div><i />xué <i /></div><small>to learn</small></div></section>
        <div className="progress-strip"><div><span className="stat-icon"><BookOpen size={20}/></span><div><strong>{entries.length}</strong><span>words in your collection</span></div></div><div><span className="stat-icon"><Check size={20}/></span><div><strong>{reviewedToday}</strong><span>prompts reviewed today</span></div></div><div><span className="stat-icon"><Leaf size={20}/></span><div><strong>{learned}</strong><span>words learned</span></div></div></div>
        <section className="sets-section"><div className="section-heading"><h2>Your study sets <span>{activeSets.length}</span></h2><button className="text-button" onClick={() => { setActiveFolder('all'); navigate('sets'); }}>View all <ArrowRight size={16}/></button></div><div className="set-grid">{data.sets.filter(s => !s.archived && !data.folders.find(f => f.id === s.folderId)?.archived).slice(0, 3).map((s, i) => <SetCard key={s.id} set={s} index={i}/>)}<button className="new-set-card" onClick={createSet}><span><Plus size={23}/></span><strong>Create a study set</strong></button></div></section>
        <button className="starred-banner" onClick={() => setup(activeSets.map(s => s.id), 'Starred')}><span className="starred-icon"><Star size={20}/></span><span><strong>Study starred cards</strong></span><span className="star-count">{starred} starred</span><ArrowRight size={19}/></button>
      </>}
      {screen === 'sets' && <>
        <div className="page-heading"><div><h1>{activeFolder === 'all' ? 'All sets' : data.folders.find(f => f.id === activeFolder)?.name || 'All sets'}</h1></div><div className="heading-actions">{activeFolder !== 'all' && folders.some(f => f.id === activeFolder) && <button className="button secondary" onClick={() => openFolderShare(activeFolder)}><Share2 size={17}/>Share folder</button>}<button className="button secondary" onClick={() => { setModal('import'); setImportResult(null); }}><Upload size={17}/>Import</button><button className="button primary" onClick={createSet}><Plus size={17}/>Create set</button></div></div>
        <div className="collection-toolbar"><div className="search"><Search size={18}/><input aria-label="Search sets and words" placeholder="Find a set or a word…" value={query} onChange={e => setQuery(e.target.value)}/></div><button className="button subtle" onClick={() => setShowArchived(v => !v)}><Archive size={17}/>{showArchived ? 'Active sets' : 'Archived'}</button></div>
        <div className="folder-tabs"><button className={cn(activeFolder === 'all' && 'selected')} onClick={() => setActiveFolder('all')}>All sets</button>{folders.map(f => <div key={f.id} className="folder-tab"><button className={cn(activeFolder === f.id && 'selected')} onClick={() => setActiveFolder(f.id)}><FolderIcon size={15}/>{f.name}</button><button className="folder-more" aria-label={`Manage ${f.name}`} onClick={() => setMenu(menu === f.id ? null : f.id)}><MoreHorizontal size={16}/></button>{menu === f.id && <div className="dropdown"><button onClick={() => openFolderShare(f.id)}><Share2 size={16}/>Share folder</button><button onClick={() => { setEditing(f.id); setModal('folder'); setMenu(null); }}><Pencil size={16}/>Rename</button><button onClick={() => setup(data.sets.filter(s => s.folderId === f.id && !s.archived).map(s => s.id))}><Sparkles size={16}/>Study folder</button><button onClick={() => exportEntries(entries.filter(e => data.sets.find(s => s.id === e.setId)?.folderId === f.id), f.name)}><ArrowDownToLine size={16}/>Export</button><button onClick={() => { update(d => ({ ...d, folders: d.folders.map(x => x.id === f.id ? { ...x, archived: true } : x) })); setMenu(null); setActiveFolder('all'); }}><Archive size={16}/>Archive</button></div>}</div>)}<button aria-label="Create folder" onClick={() => { setEditing(null); setModal('folder'); }}><Plus size={18}/></button></div>
        {selectedSets.length > 1 && <div className="selection-bar"><span>{selectedSets.length} sets selected</span><button className="button primary small" onClick={() => setup()}>Study selected <ArrowRight size={16}/></button><button className="text-button" onClick={() => setSelectedSets([])}>Clear</button></div>}
        {showArchived && data.folders.filter(f => f.archived).map(f => <div key={f.id} className="archived-folder"><span><FolderIcon size={17}/>{f.name}</span><button className="text-button" onClick={() => update(d => ({ ...d, folders: d.folders.map(x => x.id === f.id ? { ...x, archived: false } : x) }))}>Restore folder <RotateCcw size={15}/></button></div>)}<div className="set-grid collection-grid">{visibleSets.map((s, i) => <SetCard key={s.id} set={s} index={i} selectable/>)}{visibleSets.length === 0 && <div className="empty"><BookOpen size={30}/><h3>{query ? 'No words found' : 'No study sets'}</h3><p>{query ? 'Try another search.' : 'Create a set and add your first words.'}</p><button className="button primary" onClick={createSet}>Create set</button></div>}</div>
      </>}
      {screen === 'detail' && activeSet && <>
        <button className="back-link" onClick={() => navigate('sets')}><ArrowLeft size={16}/>{activeFolder === 'all' ? 'All sets' : data.folders.find(f => f.id === activeFolder)?.name || 'All sets'}</button><div className="page-heading"><div><div className="eyebrow">{data.folders.find(f => f.id === activeSet.folderId)?.name}</div><h1>{activeSet.name}<span className="accent">.</span></h1><p>{selectedEntries.length} words</p></div><button className="button primary" onClick={() => setup()}>Study set <ArrowRight size={18}/></button></div>
        <div className="collection-toolbar"><div className="search"><Search size={18}/><input aria-label="Search words" placeholder="Search Chinese, pinyin, English…" value={query} onChange={e => setQuery(e.target.value)}/></div><div className="heading-actions"><button className="button subtle" onClick={() => openShare(activeSet.id)}><Share2 size={17}/>Share</button><button className="button subtle" onClick={() => resetSet(activeSet.id)}><RotateCcw size={17}/>Reset progress</button><button className="button subtle" onClick={() => { setDestination(activeSet.id); setImportResult(null); setModal('import'); }}><Upload size={17}/>Import</button><button className="button secondary" onClick={() => editEntry()}><Plus size={17}/>Add word</button></div></div>
        <div className="word-list"><div className="word-list-head"><span>TRADITIONAL CHINESE</span><span>PINYIN</span><span>ENGLISH</span><span /></div>{selectedEntries.filter(e => searchEntry(e, query)).map(entry => <div className="word-row" key={entry.id}><button className="word-chinese" lang="zh-Hant-TW" onClick={() => editEntry(entry)}>{entry.traditional}</button><span className="word-pinyin">{entry.pinyin}</span><span className="word-english">{entry.english}</span><div className="word-actions"><button className={cn('icon-button', data.stars[key(entry.id, 'english')] && 'is-starred')} aria-label={`Star English prompt for ${entry.traditional}`} onClick={() => toggleStar(entry.id, 'english')}><Star size={18} fill={data.stars[key(entry.id, 'english')] ? 'currentColor' : 'none'}/></button><button className="icon-button" aria-label={`Edit ${entry.traditional}`} onClick={() => editEntry(entry)}><Pencil size={16}/></button></div></div>)}</div>{!selectedEntries.length && <div className="empty"><Leaf size={32}/><h3>No words in this set</h3><button className="button primary" onClick={() => editEntry()}>Add word</button></div>}
      </>}
      {screen === 'setup' && <>
        <button className="back-link" onClick={() => navigate('home')}><ArrowLeft size={16}/>Home</button><div className="setup-layout"><div className="setup-intro"><h1>Study</h1><div className="setup-glyph" lang="zh-Hant-TW" aria-hidden="true">習</div></div><section className="setup-panel"><h2>Study options</h2><label className="field-label" htmlFor="study-set">STUDY SET</label><select id="study-set" value={selectedSets.length === 1 ? selectedSets[0] : 'all'} onChange={e => setSelectedSets(e.target.value === 'all' ? activeSets.map(s => s.id) : [e.target.value])}><option value="all">{selectedSets.length > 1 ? `${selectedSets.length} selected sets` : 'All sets'}</option>{activeSets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <fieldset><legend>FRONT OF CARD</legend><div className="segmented">{(['chinese', 'pinyin', 'english', 'mixed'] as const).map(value => <button className={cn(data.preferences.prompt === value && 'selected')} key={value} onClick={() => update(d => ({ ...d, preferences: { ...d.preferences, prompt: value } }))}>{labels[value]}</button>)}</div></fieldset>
        <fieldset><legend>CARDS</legend><div className="chip-group">{['Learning', 'Learned', 'All', 'Starred'].map(value => <button key={value} className={cn('chip', data.preferences.filter === value && 'selected')} onClick={() => update(d => ({ ...d, preferences: { ...d.preferences, filter: value } }))}>{value === 'Starred' && <Star size={14}/>} {value}</button>)}</div></fieldset>
        <div className="form-two"><label>ORDER<select value={data.preferences.order} onChange={e => update(d => ({ ...d, preferences: { ...d.preferences, order: e.target.value } }))}>{['Original', 'Random'].map(o => <option key={o}>{o}</option>)}</select></label><label>AMOUNT<select value={data.preferences.amount} onChange={e => update(d => ({ ...d, preferences: { ...d.preferences, amount: e.target.value } }))}>{['10', '20', '30', 'All'].map(o => <option key={o}>{o}</option>)}</select></label></div><button className="button primary full start-button" onClick={() => startSession()}>Start studying <ArrowRight size={18}/></button><span className="setup-footnote">Know moves a card to Learned until you move it back or reset the set. Progress is separate for each front.</span></section></div>
      </>}
      {screen === 'session' && current && currentEntry && <div className="session"><div className="session-header"><button className="icon-button" aria-label="End session" onClick={() => { if (window.confirm('End this session? Your answers are already saved.'))
                navigate('home'); }}><X size={21}/></button><span>{Math.min(index + 1, queue.length)} <span className="muted">/ {queue.length}</span></span><button className="icon-button" disabled={!answers.length} aria-label="Undo last answer" onClick={undo}><RotateCcw size={19}/></button></div><div className="session-track"><span style={{ width: `${index / queue.length * 100}%` }}/></div><div className="session-context">{data.sets.find(s => s.id === currentEntry.setId)?.name}<span>·</span>{labels[current.direction]}</div>
      <div className={cn('flashcard', revealed && 'revealed')} onTouchStart={e => { touchStart.current = e.touches[0].clientX; }} onTouchEnd={e => { if (touchStart.current === null)
                return; const delta = e.changedTouches[0].clientX - touchStart.current; touchStart.current = null; if (revealed && Math.abs(delta) > 75)
                answer(delta > 0); }}><div className="flashcard-top"><span>{labels[current.direction].toUpperCase()}</span><button className={cn('icon-button', data.stars[key(currentEntry.id, current.direction)] && 'is-starred')} aria-label={data.stars[key(currentEntry.id, current.direction)] ? 'Unstar prompt' : 'Star prompt'} onClick={() => toggleStar(currentEntry.id, current.direction)}><Star size={23} fill={data.stars[key(currentEntry.id, current.direction)] ? 'currentColor' : 'none'}/></button></div><button className="card-face" onClick={toggleAnswer} aria-expanded={revealed} aria-label={revealed ? 'Hide answer' : 'Reveal answer'}><span className={cn('card-prompt', current.direction === 'chinese' && 'chinese')} lang={current.direction === 'chinese' ? 'zh-Hant-TW' : 'en'}>{current.direction === 'chinese' ? currentEntry.traditional : current.direction === 'pinyin' ? currentEntry.pinyin : currentEntry.english}</span>{revealed ? <div className="card-answer">{current.direction !== 'chinese' && <span className="answer-chinese chinese" lang="zh-Hant-TW">{currentEntry.traditional}</span>}{current.direction !== 'pinyin' && <span className="answer-pinyin">{currentEntry.pinyin}</span>}{current.direction !== 'english' && <span className="answer-english">{currentEntry.english}</span>}</div> : <span className="tap-hint">Tap to reveal <span className="desktop-hint">· press space</span></span>}</button>{revealed && <CharacterExplorer key={currentEntry.id} word={currentEntry.traditional}/>}</div>
      <div className="answer-actions"><button className="button learning" disabled={!revealed} onClick={() => answer(false)}><ArrowLeft size={18}/>Still learning</button><button className="button primary" disabled={!revealed} onClick={() => answer(true)}>Know <Check size={20}/></button></div></div>}
      {screen === 'result' && <div className="result"><div className="result-seal"><Check size={37}/></div><h1>Session complete</h1><div className="result-stats"><div><strong>{sessionTotal}</strong><span>Reviewed</span></div><div><strong>{answers.filter(a => a.correct).length}</strong><span>Learned</span></div><div><strong>{answers.filter(a => !a.correct).length}</strong><span>Still learning</span></div></div>{answers.some(a => !a.correct) && <button className="button secondary full" onClick={() => startSession(answers.filter(a => !a.correct).map(a => a.prompt))}><RotateCcw size={18}/>Review mistakes</button>}<button className="button primary full" onClick={() => navigate('home')}>Done <ArrowRight size={18}/></button><button className="text-button" onClick={undo}>Undo last answer</button></div>}
      {screen === 'settings' && <><div className="page-heading"><div><h1>Settings</h1></div></div><div className="settings-content"><section className="settings-section"><h2>Account & sync</h2><div className="settings-row"><div><strong>{email || 'Not signed in'}</strong><p>{email ? syncStatus : 'Sign in to sync across your devices.'}</p></div><button className="button secondary" onClick={() => { if (email)
            void signOut().then(() => notify('Signed out')).catch(error => notify(error instanceof Error ? error.message : 'Could not sign out'));
        else
            openAuth(); }}>{email ? 'Sign out' : 'Sign in'}</button></div>{!getClient() && <p className="settings-note">Account sync is unavailable. Progress is saved on this device.</p>}{email && !syncConflict && <button className="text-button" onClick={() => void connectCloud()}>Sync now</button>}{syncConflict && <div role="alert"><p className="settings-note">This device and the cloud both changed. Export your words before replacing either copy.</p><div className="heading-actions"><button className="button secondary" onClick={() => void resolveSync(true)}>Keep this device</button><button className="button secondary" onClick={() => void resolveSync(false)}>Use cloud copy</button></div></div>}</section><section className="settings-section"><h2>Your vocabulary</h2><div className="settings-row"><div><strong>Export vocabulary</strong><p>Download all words as CSV.</p></div><button className="button secondary" onClick={() => exportEntries(entries, 'mori-vocabulary')}><ArrowDownToLine size={17}/>Export all</button></div><div className="settings-row"><div><strong>Import vocabulary</strong><p>Import a spreadsheet or paste a list.</p></div><button className="button secondary" onClick={() => { setImportResult(null); setModal('import'); }}><Upload size={17}/>Import</button></div></section><section className="settings-section"><h2>Install Mori</h2><p className="settings-note">In your browser menu, choose “Install app” or “Add to Home Screen”. Open Mori once online to keep studying offline.</p></section><section className="settings-section credits"><h2>About Mori</h2><p>Taiwanese Mandarin · Traditional Chinese</p><p>Chinese typeface: 教育部標準楷書 · 中華民國教育部<br />CC BY-ND 3.0 TW. Font redistributed unchanged.</p><a href="https://cc-cedict.org/" target="_blank" rel="noreferrer">CC-CEDICT attribution <ArrowRight size={14}/></a><a href="https://creativecommons.org/licenses/by-nd/3.0/tw/" target="_blank" rel="noreferrer">Font licence <ArrowRight size={14}/></a><p>Character reference: Dong Chinese Character Wiki · CC BY-SA 4.0. Stroke graphics: Make Me a Hanzi · Arphic Public License. Historical images open on the source site.</p><a href="/character-data/README.txt" target="_blank" rel="noreferrer">Character data & licences <ArrowRight size={14}/></a><p>Optional dictionary: CC-CEDICT · CC BY-SA 4.0. Suggestions appear in the word editor when a local corpus is configured.</p></section></div></>}
      </>}
      </main>
      {!isStudy && <nav className="bottom-nav" aria-label="Mobile navigation">{([{ id: 'home', label: 'Home', icon: Home }, { id: 'sets', label: 'Sets', icon: BookOpen }, { id: 'setup', label: 'Study', icon: Sparkles }, { id: 'explore', label: 'Explore', icon: Compass }, { id: 'settings', label: 'Settings', icon: Settings }] as const).map(item => <button key={item.id} className={cn((screen === item.id || (screen === 'detail' && item.id === 'sets')) && 'active')} onClick={() => item.id === 'setup' ? setup(activeSets.map(s => s.id)) : navigate(item.id)}><item.icon size={21}/><span>{item.label}</span></button>)}</nav>}
    </div>
    {toast && <div className="toast" role="status"><Check size={17}/>{toast}</div>}
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget)
            closeModal(); }}><section key={modal} className={cn('modal', modal === 'import' && 'import-modal')} role="dialog" aria-modal="true" aria-labelledby="modal-title" onKeyDown={e => { if (e.key === 'Escape')
            closeModal(); if (e.key === 'Tab') {
            const nodes = e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select,a[href]');
            const first = nodes[0], last = nodes[nodes.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
            }
            else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
            }
        } }}><div className="modal-heading"><div><h2 id="modal-title">{modal === 'share' ? sharingFolder ? 'Share folder' : 'Share set' : modal === 'save-set' ? 'Save sets to your account' : modal === 'folder' ? (editing ? 'Rename folder' : 'Create a folder') : modal === 'set' ? (editing ? 'Edit study set' : 'Create a study set') : modal === 'entry' ? (editing ? 'Edit word' : 'Add a word') : modal === 'import' ? 'Import vocabulary' : 'Account'}</h2></div><button autoFocus className="icon-button" aria-label="Close dialog" onClick={closeModal}><X size={22}/></button></div>
      {modal === 'share' && sharingSet && <ShareSet key={`${libraryMeta.current.owner}:${sharingSet.id}`} set={sharingSet} entries={entries.filter(e => e.setId === sharingSet.id)} owner={libraryMeta.current.owner} signedIn={!!email} onAuth={signup => openAuth(signup)}/>}
      {modal === 'share' && sharingFolder && <ShareSet key={`${libraryMeta.current.owner}:folder:${sharingFolder.id}`} set={sharingFolder} collectionSets={folderSharingSets.map(s => ({ id: s.id, name: s.name }))} entries={entries.filter(e => folderSharingSets.some(s => s.id === e.setId))} owner={libraryMeta.current.owner} signedIn={!!email} onAuth={signup => openAuth(signup)}/>}
      {modal === 'save-set' && <><p className="modal-intro">Without an account, this set is saved only in this browser. Clearing browser data will delete it.</p>{getClient() ? <><p className="modal-intro">Create an account to save new sets online and access them on other devices.</p><div className="account-prompt-actions"><button className="button primary full" onClick={() => openAuth(true, true)}>Create account</button><button className="button secondary full" onClick={() => openAuth(false, true)}>Sign in</button></div></> : <p className="modal-intro">Account sign-in is currently unavailable.</p>}<button className="button subtle full" onClick={() => setModal('set')}>Continue in this browser</button></>}
      {modal === 'set' && !email && <p className="modal-intro">This set will be saved only in this browser.</p>}
      {(modal === 'folder' || modal === 'set') && <form onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); const name = String(form.get('name')).trim(); if (!name)
            return; if (modal === 'folder') {
            update(d => ({ ...d, folders: editing ? d.folders.map(f => f.id === editing ? { ...f, name } : f) : [...d.folders, { id: uid(), name }] }));
        }
        else {
            const folderId = String(form.get('folderId'));
            const id = editing || uid();
            update(d => ({ ...d, sets: editing ? d.sets.map(s => s.id === editing ? { ...s, name, folderId } : s) : [...d.sets, { id, folderId, name }] }));
            setSelectedSets([id]);
            navigate('detail');
        } closeModal(); notify('Saved'); }}><label>Name<input name="name" required maxLength={120} placeholder={modal === 'folder' ? 'e.g. Mandarin Class' : 'e.g. Everyday words'} defaultValue={modal === 'folder' ? data.folders.find(f => f.id === editing)?.name : data.sets.find(s => s.id === editing)?.name}/></label>{modal === 'set' && <label>Folder<select aria-label="Folder" name="folderId" defaultValue={data.sets.find(s => s.id === editing)?.folderId || (activeFolder !== 'all' ? activeFolder : folders[0]?.id)}>{folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}<button className="button primary full" type="submit">{editing ? 'Save changes' : 'Create'}<ArrowRight size={17}/></button></form>}
      {modal === 'entry' && <EntryForm entry={data.entries.find(e => e.id === editing)} learned={directions.some(d => isLearned(data.progress[key(editing || '', d)]))} onLearning={() => { if (editing) moveToLearning(editing); }} stars={data.stars} onStar={d => { if (editing)
            toggleStar(editing, d); }} onSave={entry => { update(d => ({ ...d, entries: editing ? d.entries.map(x => x.id === editing ? entry : x) : [...d.entries, entry] })); closeModal(); notify('Word saved'); }} setId={activeSet?.id || data.sets[0]?.id} onArchive={() => { update(d => ({ ...d, entries: d.entries.map(x => x.id === editing ? { ...x, archived: true } : x) })); closeModal(); notify('Word archived'); }} onDuplicate={() => { const e = data.entries.find(e => e.id === editing); if (e)
            update(d => ({ ...d, entries: [...d.entries, { ...e, id: uid() }] })); closeModal(); notify('Word duplicated'); }} onDelete={() => { if (!window.confirm('Delete this word permanently?'))
            return; update(d => ({ ...d, entries: d.entries.filter(e => e.id !== editing), progress: Object.fromEntries(Object.entries(d.progress).filter(([k]) => !k.startsWith(`${editing}:`))), stars: Object.fromEntries(Object.entries(d.stars).filter(([k]) => !k.startsWith(`${editing}:`))) })); closeModal(); notify('Word deleted'); }}/>}
      {modal === 'auth' && <><p className="modal-intro">Sign in or create an account to save new sets online and sync progress across devices.</p>{!getClient() ? <div className="local-mode"><Cloud size={28}/><h3>Local storage</h3><p>Sign-in is unavailable. Progress is saved in this browser.</p><button className="button primary full" onClick={closeModal}>Close <ArrowRight size={18}/></button></div> : <form onSubmit={async (e) => { e.preventDefault(); setAuthBusy(true); setAuthError(''); const form = new FormData(e.currentTarget); try {
            const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement;
            const action = submitter?.value === 'signup' ? signUp : signIn;
            const result = await action(String(form.get('email')), String(form.get('password')));
            if (submitter?.value === 'signup' && result) {
                notify('Check your email to confirm your account.');
            }
            else
                notify('Signed in');
            if (result) closeModal();
            else { setModal(null); setEditing(null); setAuthError(''); }
        }
        catch (error) {
            setAuthError(error instanceof Error ? error.message : 'Could not sign in');
        }
        finally {
            setAuthBusy(false);
        } }}><label>Email<input name="email" type="email" autoComplete="email" required placeholder="you@example.com"/></label><label>Password<input name="password" type="password" autoComplete="current-password" minLength={8} required/></label>{authError && <p role="alert" className="form-error">{authError}</p>}<button className={cn("button full", preferSignUp ? "secondary" : "primary")} disabled={authBusy} type="submit" value="signin">{authBusy ? 'Signing in…' : 'Sign in'}<ArrowRight size={18}/></button><button className={cn("button full", preferSignUp ? "primary" : "subtle")} disabled={authBusy} type="submit" value="signup">Create account</button></form>}</>}
      {modal === 'import' && <><input ref={fileRef} type="file" className="sr-only" accept=".csv,.xlsx" onChange={e => { const f = e.target.files?.[0]; if (f)
            void readImport(f); }}/>{!importResult ? <><button className="upload-zone" onClick={() => fileRef.current?.click()}><span><Upload size={25}/></span><strong>{importBusy ? 'Reading file…' : 'Choose a spreadsheet'}</strong><small>XLSX or CSV · up to 5 MB</small></button><div className="or-divider">or paste vocabulary</div><textarea className="paste-input" aria-label="Paste vocabulary" placeholder={'學生\tstudent\txuéshēng\n老師\tteacher\tlǎoshī'} rows={5} value={importText} onChange={e => setImportText(e.target.value)}/><button className="button primary full" disabled={!importText.trim()} onClick={() => { try {
            setImportSource(importText);
            setImportResult(parseText(importText));
        }
        catch (e) {
            notify(e instanceof Error ? e.message : 'Could not read text');
        } }}>Preview words <ArrowRight size={18}/></button></> : <ImportPreview result={importResult} onFormat={async (format) => { if (!importSource)
            return; setImportBusy(true); try {
            setImportResult(typeof importSource === 'string' ? parseText(importSource, undefined, format) : await parseFile(importSource, undefined, format));
        }
        finally {
            setImportBusy(false);
        } }} onChange={setImportResult} onBack={() => setImportResult(null)} destination={destination} setDestination={setDestination} sets={activeSets} importName={importName} setImportName={setImportName} folders={folders} importFolder={importFolder} setImportFolder={setImportFolder} onImport={() => { const result = importResult as ImportResult; const valid = result.entries; if (!valid.length)
            return; const setId = destination === 'new' ? uid() : destination; update(d => ({ ...d, sets: destination === 'new' ? [...d.sets, { id: setId, folderId: importFolder, name: importName || 'Imported set' }] : d.sets, entries: [...d.entries, ...valid.map(e => ({ ...makeEntry({ ...e, alignment: undefined }, setId), id: uid(), setId }))] })); closeModal(); openSet(setId); notify(`${valid.length} words imported`); }}/>}</>}
    </section></div>}
  </div>;
    function SetCard({ set: s, index: i, selectable = false }: {
        set: Set;
        index: number;
        selectable?: boolean;
    }) { const words = entries.filter(e => e.setId === s.id); const known = words.filter(e => directions.some(d => isLearned(data.progress[key(e.id, d)]))).length; return <article className="set-card"><div className="set-card-top"><span className={cn('set-symbol', i % 3 === 1 && 'sage', i % 3 === 2 && 'sand')} lang="zh-Hant-TW">{words[0]?.traditional.slice(0, 1) || '字'}</span><div className="set-menu-wrap"><button className="icon-button" aria-label={`Manage ${s.name}`} onClick={() => setMenu(menu === s.id ? null : s.id)}><MoreHorizontal size={20}/></button>{menu === s.id && <div className="dropdown"><button onClick={() => openShare(s.id)}><Share2 size={15}/>Share link</button><button onClick={() => { setEditing(s.id); setModal('set'); setMenu(null); }}><Pencil size={15}/>Edit / move</button><button onClick={() => resetSet(s.id)}><RotateCcw size={15}/>Reset progress</button><button onClick={() => duplicateSet(s)}><Copy size={15}/>Duplicate</button><button onClick={() => exportEntries(words, s.name)}><ArrowDownToLine size={15}/>Export CSV</button><button onClick={() => { update(d => ({ ...d, sets: d.sets.map(x => x.id === s.id ? { ...x, archived: !x.archived } : x) })); setMenu(null); }}><Archive size={15}/>{s.archived ? 'Restore' : 'Archive'}</button></div>}</div></div><button className="set-open" onClick={() => openSet(s.id)}><span className="set-folder">{data.folders.find(f => f.id === s.folderId)?.name || 'My collection'}</span><h3>{s.name}</h3><span className="set-words">{words.length} words</span></button><div className="set-progress"><span style={{ width: `${words.length ? known / words.length * 100 : 0}%` }}/></div><div className="set-card-bottom"><span>{`${known} learned`}</span>{selectable ? <label className="select-set"><input type="checkbox" aria-label={`Select ${s.name}`} checked={selectedSets.includes(s.id)} onChange={e => setSelectedSets(ids => e.target.checked ? [...ids, s.id] : ids.filter(x => x !== s.id))}/>Select</label> : <button className="icon-button" aria-label={`Study ${s.name}`} onClick={() => setup([s.id])}><ArrowRight size={18}/></button>}</div></article>; }
}
function EntryForm({ entry, setId, learned, onLearning, stars, onStar, onSave, onArchive, onDuplicate, onDelete }: {
    entry?: Entry;
    setId: string;
    learned: boolean;
    onLearning: () => void;
    stars: Record<string, boolean>;
    onStar: (d: Direction) => void;
    onSave: (entry: Entry) => void;
    onArchive: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
}) {
    const [traditional, setTraditional] = useState(entry?.traditional || '');
    const [pinyin, setPinyin] = useState(entry?.pinyin || '');
    const [english, setEnglish] = useState(entry?.english || '');
    const [advanced, setAdvanced] = useState(false);
    const [alignment, setAlignment] = useState(entry?.alignment || []);
    const [error, setError] = useState('');
    const [suggestions, setSuggestions] = useState<{
        pinyin: string;
        english: string;
    }[]>([]);
    const [dictionaryNote, setDictionaryNote] = useState('');
    const alignmentSource = useRef(`${entry?.traditional || ''}\0${entry?.pinyin || ''}`);
    useEffect(() => { const source = `${traditional}\0${pinyin}`; if (source === alignmentSource.current)
        return; alignmentSource.current = source; if (!traditional || !pinyin)
        return; try {
        setAlignment(makeEntry({ traditional, pinyin, english: '…' }, setId).alignment);
    }
    catch { } }, [traditional, pinyin, setId]);
    return <form onSubmit={e => { e.preventDefault(); try {
        const form = new FormData(e.currentTarget);
        const next = makeEntry({ traditional, english, pinyin, notes: String(form.get('notes') ?? entry?.notes ?? ''), tags: String(form.get('tags') ?? entry?.tags?.join(',') ?? '').split(',').map(x => x.trim()).filter(Boolean), partOfSpeech: String(form.get('partOfSpeech') ?? entry?.partOfSpeech ?? ''), exampleTraditional: String(form.get('exampleTraditional') ?? entry?.exampleTraditional ?? ''), examplePinyin: String(form.get('examplePinyin') ?? entry?.examplePinyin ?? ''), exampleEnglish: String(form.get('exampleEnglish') ?? entry?.exampleEnglish ?? '') }, setId);
        onSave({ ...entry, ...next, id: entry?.id || next.id, alignment, alignmentReview: alignment.some(a => !a.pinyin.trim()) });
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Check the required fields');
    } }}><label>Traditional Chinese<input lang="zh-Hant-TW" className="chinese-input" required maxLength={200} value={traditional} onChange={e => setTraditional(e.target.value)} placeholder="學生"/></label><button type="button" className="text-button dictionary-lookup" disabled={!traditional.trim()} onClick={async () => { setDictionaryNote('Looking up…'); try {
        const response = await fetch(`/api/dictionary?q=${encodeURIComponent(traditional)}`);
        const found = await response.json();
        setSuggestions(found.suggestions || []);
        setDictionaryNote(found.enabled ? (found.suggestions?.length ? 'CC-CEDICT suggestions' : 'No dictionary match.') : 'Dictionary is not configured. Keep your own pronunciation.');
    }
    catch {
        setDictionaryNote('Dictionary unavailable.');
    } }}>Dictionary suggestions <Search size={14}/></button>{dictionaryNote && <p className="dictionary-note">{dictionaryNote}</p>}{suggestions.length > 0 && <div className="dictionary-suggestions">{suggestions.map((s, i) => <button type="button" key={i} onClick={() => { setPinyin(s.pinyin); setEnglish(s.english); setSuggestions([]); setDictionaryNote('Suggestion applied. Edit it any time.'); }}><span>{s.pinyin}</span><small>{s.english}</small><span>Use suggestion</span></button>)}</div>}<div className="form-two"><label>Pinyin<input required value={pinyin} maxLength={500} onChange={e => setPinyin(e.target.value)} placeholder="xuéshēng"/></label><label>English<input required maxLength={1000} value={english} onChange={e => setEnglish(e.target.value)} placeholder="student"/></label></div>{alignment.length > 0 && <div className="alignment-editor"><span className="field-label">CHARACTER PRONUNCIATION</span><div>{alignment.map((a, i) => <label key={i}><strong lang="zh-Hant-TW" className="chinese">{a.character}</strong><input aria-label={`Pronunciation for ${a.character} ${i + 1}`} value={a.pinyin} onChange={e => setAlignment(v => v.map((x, j) => j === i ? { ...x, pinyin: e.target.value } : x))}/></label>)}</div></div>}{entry && <div className="entry-stars"><span className="field-label">LEARNING STATUS</span><p className="settings-note">{learned ? 'Learned in at least one front.' : 'Learning in all fronts.'}</p>{learned && <button type="button" className="button secondary full" onClick={onLearning}><RotateCcw size={16}/>Move back to Learning</button>}</div>}{entry && <div className="entry-stars"><span className="field-label">STAR A PROMPT</span><div>{directions.map(d => <button className={cn('chip', stars[key(entry.id, d)] && 'selected')} type="button" key={d} onClick={() => onStar(d)}><Star size={15} fill={stars[key(entry.id, d)] ? 'currentColor' : 'none'}/>{labels[d]}</button>)}</div></div>}<CharacterExplorer key={traditional} word={traditional}/><button type="button" className="text-button advanced-toggle" onClick={() => setAdvanced(v => !v)}>{advanced ? 'Less detail' : 'Notes & tags'}<ChevronDown size={15}/></button>{advanced && <><label>Notes<textarea name="notes" defaultValue={entry?.notes} rows={2}/></label><label>Tags<input name="tags" defaultValue={entry?.tags?.join(', ')} placeholder="Separate with commas"/></label><label>Part of speech<input name="partOfSpeech" defaultValue={entry?.partOfSpeech}/></label><label>Example · Chinese<input name="exampleTraditional" lang="zh-Hant-TW" defaultValue={entry?.exampleTraditional}/></label><label>Example · Pinyin<input name="examplePinyin" defaultValue={entry?.examplePinyin}/></label><label>Example · English<input name="exampleEnglish" defaultValue={entry?.exampleEnglish}/></label></>}{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full" type="submit">Save word <Check size={18}/></button>{entry && <div className="entry-management"><button className="text-button" type="button" onClick={onDuplicate}><Copy size={15}/>Duplicate</button><button className="text-button" type="button" onClick={onArchive}><Archive size={15}/>Archive</button><button className="text-button danger" type="button" onClick={onDelete}><Trash2 size={15}/>Delete</button></div>}</form>;
}
function ImportPreview({ result, onFormat, onChange, onBack, destination, setDestination, sets, importName, setImportName, folders, importFolder, setImportFolder, onImport }: {
    result: ImportResult;
    onFormat: (f: 'tabular' | 'vertical') => void;
    onChange: (r: ImportResult) => void;
    onBack: () => void;
    destination: string;
    setDestination: (s: string) => void;
    sets: Set[];
    importName: string;
    setImportName: (s: string) => void;
    folders: Folder[];
    importFolder: string;
    setImportFolder: (s: string) => void;
    onImport: () => void;
}) {
    return <><div className="import-summary"><span><Check size={17}/>{result.entries.length} words detected</span><button className="text-button" onClick={onBack}>Change source</button></div><div className="import-format"><label>Format <select aria-label="Import format" value={result.format} onChange={e => onFormat(e.target.value as 'tabular' | 'vertical')}><option value="tabular">Three columns</option><option value="vertical">Vertical groups</option></select></label><span>Detected: {result.format}</span></div>{result.errors.length > 0 && <div className="import-errors" role="alert">{result.errors.map((e, i) => <p key={i}>{`Row ${e.row}: ${e.message}`} </p>)}</div>}{result.warnings.length > 0 && <details className="import-warnings"><summary>{result.warnings.length} items to review</summary>{result.warnings.map((w, i) => <p key={i}>{`Row ${w.row}: ${w.message}`} </p>)}</details>}<div className="import-table"><div className="import-table-head"><span>CHINESE</span><span>ENGLISH</span><span>PINYIN</span></div>{result.entries.map((entry, i) => <div className="import-row" key={i}>{(['traditional', 'english', 'pinyin'] as const).map(field => <input key={field} lang={field === 'traditional' ? 'zh-Hant-TW' : 'en'} aria-label={`${field} row ${i + 1}`} value={entry[field]} onChange={e => { const updated = [...result.entries]; updated[i] = { ...entry, [field]: e.target.value }; const validation = validateEntries(updated); onChange({ ...result, entries: updated, errors: [...result.errors.filter(x => /Incomplete|Unreadable|too large|at most/.test(x.message)), ...validation.errors], warnings: validation.warnings }); }}/>)}</div>)}</div><label>Destination<select aria-label="Destination" value={destination} onChange={e => setDestination(e.target.value)}>{sets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}<option value="new">+ Create a new set</option></select></label>{destination === 'new' && <label>Folder<select aria-label="Import folder" value={importFolder} onChange={e => setImportFolder(e.target.value)}>{folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}{destination === 'new' && <label>Set name<input aria-label="Set name" value={importName} onChange={e => setImportName(e.target.value)}/></label>}<button className="button primary full" disabled={!result.entries.length || result.errors.length > 0 || (destination === 'new' && (!importName.trim() || !folders.some(f => f.id === importFolder)))} onClick={onImport}>Import {result.entries.length} words <ArrowRight size={18}/></button></>;
}
