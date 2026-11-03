# Cloud setup

1. Create a Supabase project.
2. Apply `migrations/202611030001_library.sql` in the Supabase SQL editor (or link the project with the Supabase CLI and run `supabase db push`).
3. Enable email/password authentication in Authentication → Providers. Set the Site URL to the deployed app URL and configure allowed redirect URLs. For local development use `http://localhost:3000`.
4. Copy `.env.example` to `.env.local`, replacing the project URL and public anon/publishable key. Add the same values in Vercel, then rebuild. Never add a service-role key.
5. Create an account in Settings. If email confirmation is enabled, confirm the email before signing in.

The app remains usable on-device when Supabase is unconfigured. Browser storage survives ordinary refreshes, but clearing browser storage removes that device's local copy; export CSV as a portable backup.

## Data model

A single `user_state` row stores each user's complete library as JSONB. Within the snapshot, folders own sets, sets own entries, and each entry has independent `entryId:chinese`, `entryId:pinyin`, and `entryId:english` progress and star keys. This intentionally small MVP model makes a study answer, progress update, and vocabulary changes one atomic sync operation rather than introducing separate distributed writes. The server validates collection bounds, ids, relationships, direction keys, and progress values; PostgreSQL bounds snapshot size. Chinese is never a unique key.

Every table operation requires `auth.uid() = user_id`. The sync route verifies the bearer session against Supabase Auth. The RPC is SECURITY INVOKER, so it cannot bypass Row Level Security. Anonymous roles have no table permissions. The browser's public key is expected to be public; authorization comes from the signed user token and RLS.

`revision` gives optimistic concurrency. Clients load a revision before saving. A stale offline client receives HTTP 409 and keeps its local library; Settings offers explicit **Keep this device** and **Use cloud copy** actions. Export vocabulary you want to preserve before replacing a copy; CSV does not include progress. Automatic merging is intentionally not implemented. Failed network writes remain local and can be retried.

## Verify access after setup

Using two separate test accounts, save different libraries, then confirm each account can load only its own row. An unauthenticated `/api/sync` request must return 401. A stale `expectedRevision` must return 409. Delete a test account and verify its row is removed by the auth foreign key. Live authentication, PostgreSQL execution, and RLS enforcement require a configured Supabase project and cannot be certified from local unit tests alone.
