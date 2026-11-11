'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { communityRequest } from '@/lib/sharing-client';
import { creatorNameSchema } from '@/lib/sharing-schema';

const profileSchema = z.object({ displayName: z.string().max(50) });
export function usePublicProfile(owner: string, signedIn: boolean, online: boolean) {
    const [state, setState] = useState({ owner: '', displayName: '', loaded: false, error: '', feedback: '', saving: false });
    const [attempt, setAttempt] = useState(0);
    const generation = useRef(0);
    const invalidate = useCallback(() => ++generation.current, []);
    useEffect(() => {
        const version = invalidate();
        if (!signedIn) return;
        setState(previous => ({ ...previous, owner, displayName: previous.owner === owner ? previous.displayName : '', loaded: false, error: '', feedback: '', saving: false }));
        if (!online) return;
        communityRequest('GET', owner, '/profile').then(value => {
            const profile = profileSchema.parse(value);
            if (generation.current === version) setState({ owner, ...profile, loaded: true, error: '', feedback: '', saving: false });
        }).catch(error => {
            if (generation.current === version) setState(s => ({ ...s, error: error instanceof Error ? error.message : 'Could not load your public name.' }));
        });
        return () => { invalidate(); };
    }, [owner, signedIn, online, attempt, invalidate]);
    return {
        ...(state.owner === owner && signedIn ? state : { displayName: '', loaded: false, error: '', feedback: '', saving: false }),
        online,
        retry: () => setAttempt(n => n + 1),
        acceptName: (displayName: string) => {
            invalidate();
            setState(s => ({ ...s, owner, displayName, loaded: true, feedback: '', error: '' }));
        },
        save: async (displayName: string) => {
            const version = invalidate();
            setState(s => ({ ...s, saving: true, feedback: '' }));
            try {
                const value = profileSchema.parse(await communityRequest('POST', owner, '/profile', { displayName }));
                if (version !== generation.current) throw new Error('Account changed. Reopen Settings.');
                setState({ owner, ...value, loaded: true, error: '', feedback: 'Public name saved.', saving: false });
            } finally {
                if (version === generation.current) setState(s => ({ ...s, saving: false }));
            }
        },
    };
}
export function PublicNameSettings({ profile }: { profile: ReturnType<typeof usePublicProfile> }) {
    return <div className="public-profile"><h3>Public name</h3><p className="settings-note">Shown on sets and folders you publish. Your email stays private. Names don’t need to be unique.</p>
        {!profile.online ? <p className="settings-note">Connect to the internet to edit your public name.</p> : profile.error ? <><p className="form-error" role="alert">{profile.error}</p><button className="button secondary" onClick={profile.retry}>Try again</button></> : !profile.loaded ? <p role="status">Loading public name…</p> : <PublicNameForm key={profile.displayName} profile={profile}/>}
        {profile.feedback && <p role="status" className="share-note">{profile.feedback}</p>}
    </div>;
}
function PublicNameForm({ profile }: { profile: ReturnType<typeof usePublicProfile> }) {
    const [name, setName] = useState(profile.displayName), [error, setError] = useState('');
    return <form className="public-name-form" onSubmit={async event => {
        event.preventDefault(); setError('');
        const parsed = creatorNameSchema.safeParse(name);
        if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
        try { await profile.save(parsed.data); }
        catch (error) { setError(error instanceof Error ? error.message : 'Could not save your public name.'); }
    }}><label className="sr-only" htmlFor="public-profile-name">Public name</label><div className="public-name-controls"><input id="public-profile-name" name="publicName" autoComplete="nickname" placeholder="Choose a public name" value={name} minLength={2} maxLength={50} required disabled={profile.saving} onChange={e => { setName(e.target.value); setError(''); }}/><button className="button secondary" disabled={profile.saving || name.trim().length < 2 || name.trim() === profile.displayName}>{profile.saving ? 'Saving…' : 'Save name'}</button></div>{error && <p className="form-error" role="alert">{error}</p>}</form>;
}
