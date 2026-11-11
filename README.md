# Mori 森

A calm, mobile-first Taiwanese Mandarin flashcard app. Next.js App Router, React, TypeScript, Stack Auth, Prisma ORM/Postgres, and plain responsive CSS. No audio, stroke order, or response-time tracking.

## Run

Node 22.12+ (or Node 24+) and pnpm 10+ recommended.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000. The app works immediately in local mode with **Mandarin Class → Unit 1**, imported from the supplied workbook. Browser storage preserves vocabulary, preferences, direction-specific stars, and review results. Local mode is not a simulated sign-in; cloud accounts require Stack Auth and Prisma Postgres configuration.

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm start
pnpm test:e2e
```

Browser tests use installed Google Chrome (`channel: 'chrome'`). Install Chrome, or remove `channel` from `playwright.config.ts` and run `pnpm exec playwright install chromium`. `pnpm test:e2e` builds and tests the production server, including offline reload; the test server requires port 3000 to be free. Stop a development server before launching a production server on that port.

## Features

- Folder/set create, rename, move, duplicate, archive, restore; multi-set and folder study.
- Create/edit/duplicate/archive/delete words; optional notes, tags, contextual pronunciation alignment.
- Chinese, Pinyin, English, and mixed prompts. Each word has exactly three independent progress/star dimensions. Mixed and starred are selection modes only.
- Reveal, Know/Still learning, undo, swipe, and keyboard controls. Still learning keeps a card available for your next session; you can also review mistakes immediately from the results screen.
- Cards start in Learning. Know moves the current front to Learned permanently; Still learning moves it back. Study Learning (default), Learned, All, or Starred, in Original or Random order. Progress remains separate for Chinese, Pinyin, and English. Move a word back to Learning from its word editor, or reset a whole set; vocabulary and stars are preserved. Existing answer history is retained; legacy review dates are ignored.
- Search Chinese, English, marked/plain/numbered Pinyin, notes, and tags.
- CSV/XLSX and pasted tabular/vertical imports with editable preview, errors, warnings, and destination selection. Source text is retained; numbered input is displayed with tone marks.
- UTF-8 CSV exports protect formula-like values with a leading apostrophe. This safety prefix is intentionally visible on reimport; do not silently strip it.
- PWA manifest, 192/512 px icons, safe-area navigation, service worker shell cache and on-device offline progress. HTTPS or localhost required. Install from the browser menu. Open once online and allow the shell to finish downloading before using offline.

## Real workbook import

The supplied `Mandarin_Unit_1_3_Fields_Anki.xlsx` is **tabular**, not vertical: 55 rows of Traditional Chinese, English, and Pinyin. All **55 entries** were imported with **zero warnings/errors** through the same `parseRows` validation used by the upload flow, decoded with `read-excel-file`. The browser upload route is also covered by Playwright.

```sh
pnpm import:seed
```

Regenerates `src/data/unit1.json` and `src/data/import-report.json` from the real workbook. Seed IDs remain deterministic; it does not replace an existing browser library. To try a fresh import without resetting local progress, upload the workbook and select a new destination set. CSV headings are `traditional,english,pinyin,notes,tags`. No headers are required for three-column data; single-column data is grouped Traditional Chinese → English → Pinyin. Import limits: 5 MB compressed, 32 MB expanded, 2,048 archive records, and 5,000 entries per file. Encrypted, ZIP64, and malformed archives are rejected before decompression. Parsers read values only, never execute formulas/macros/external links. Only the first XLSX worksheet is read.

## Font

Full unchanged **EduKai 5.1**, supplied by the user, is served at `/fonts/edukai.ttf`. The embedded font metadata and official Taiwan Ministry of Education licence permit unchanged redistribution with attribution. Chinese content uses `lang="zh-Hant-TW"`; UI/Pinyin/English use Avenir Next with sans-serif fallbacks. Font size is approximately 15.8 MB because the licence prohibits modified derivatives; it is not subsetted. See [FONT-LICENSE.md](FONT-LICENSE.md). Attribution: **中華民國教育部**, CC BY-ND 3.0 TW. The original input file remains untouched.

## Share study sets and folders

Open a set and choose **Share** (or **Share link** in its menu). Signed-in users can create an unlisted link, copy it, explicitly update its shared version, or stop sharing. Words, notes, tags, examples, and pronunciation alignment are included; account details, other folders, stars, and study progress are excluded. Anyone with the link can open it without an account. Public sets and folders also appear in Explore. Share pages are excluded from search indexing.

Recipients preview the vocabulary and choose **Add to library** to save an independent copy in a folder. Each word gets a fresh ID and starts in Learning. Revisiting the same link offers **Open your copy**. Updates and revocation do not alter previously saved copies, which use the existing offline and account-sync behavior. Guests see the browser-storage notice and account signup action. A signed-in library must finish syncing before accepting a copy.

Sharing uses `shared_deck` with one snapshot per owner, source ID and kind (set/folder), capped at 5,000 words and 2 MB per write. The existing Prisma Postgres and Hexclave configuration is sufficient; no additional service or environment variables are needed. Run `pnpm db:migrate` before using this feature or deploying the change. Public snapshots are fetched without caching; the service worker only caches the page shell, so revoked vocabulary is not available from an offline snapshot.

## Stack Auth, Prisma Postgres, and Vercel

**No accounts or environment variables are needed to use Mori locally.** The Excel workbook is already bundled as the starter library. To enable sign-in and phone/laptop sync, set up two hosted services once:

1. Create a **Stack Auth** project, enable email/password authentication, and allow `http://localhost:3000` plus your deployed Vercel origin in its domains/redirect settings. Copy the project ID and secret server key. A publishable client key is only needed if the project requires one. The current official Stack Auth site/docs redirect to Hexclave; this app pins the published `@stackframe/stack` SDK and uses its custom-form APIs.
2. Create a **Prisma Postgres** database, either in Prisma Console or through the Vercel Marketplace. Copy its standard pooled PostgreSQL connection URL (`postgres://…` or `postgresql://…`), not a `prisma+postgres://` Accelerate URL.
3. Copy `.env.example` to `.env.local` and fill in:

   ```dotenv
   NEXT_PUBLIC_HEXCLAVE_PROJECT_ID=...
   HEXCLAVE_SECRET_SERVER_KEY=...
   DATABASE_URL=postgresql://...
   ```

   Legacy `NEXT_PUBLIC_STACK_PROJECT_ID`, `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY`, and `STACK_SECRET_SERVER_KEY` names also work. If required, set `NEXT_PUBLIC_HEXCLAVE_PUBLISHABLE_CLIENT_KEY`. Keep the secret key and database URL server-only. An optional `DIRECT_DATABASE_URL` can be used for CLI migrations; otherwise the CLI uses `DATABASE_URL`. Prisma CLI reads `.env.local`, then `.env`, without overwriting existing process variables.
4. Run `pnpm db:migrate` once to create the database table. `pnpm db:validate` checks the schema. Client generation runs on dependency installation and every build. Restart `pnpm dev` after changing keys.
5. In Vercel, use **mandarin** as the root directory, Next.js as framework, `pnpm install --frozen-lockfile` for install, and `pnpm build` for build. Add the same environment values. Public Stack keys are compiled into the browser bundle, so changing them requires rebuilding. Run `pnpm db:migrate` against the production database before the first deployment and whenever a new migration is added. Use separate projects/databases for preview deployments if previews should not access production data.
6. Create an account using Mori's existing email/password form. Stack handles email verification on its hosted verification page; return to Mori and sign in afterward if verification is required. Each new account receives the **55 Excel words**, then its library syncs automatically. There is no global/shared user seed and nothing to seed in SQL.

The browser interface, layouts, study behavior, imports, and local storage keys are preserved. No Stack provider UI or stylesheet is mounted. The only visible text updates replace the previous provider name in local setup hints.

A single JSONB snapshot per verified Stack user keeps library sync atomic. Every API call verifies the Stack session on the server, and every database query is scoped to that verified ID. A body-supplied owner is ignored. A request-owner check cancels requests if accounts change while a token is acquired. Database credentials are never sent to the browser. Unlike Supabase, this setup uses server-side ownership checks rather than Supabase RLS or an `auth.users` foreign key.

Prisma schema and versioned SQL migrations live in the repo; the writable production database lives in Prisma Postgres. A reused Prisma client and small `pg` pool suit warm Vercel functions. The runtime accepts standard PostgreSQL URLs and uses the Prisma `pg` adapter. Prisma 7 is pinned to its supported stable release rather than the Prisma 8 release candidate.

Server Zod validation checks collection limits, direction keys, counters, references, and IDs. Each save performs one parameterized atomic compare-and-swap: a null revision can only create a library, and a numbered revision can only update that exact existing version. Competing writes return HTTP 409 instead of overwriting another device. Database/provider outages return retryable errors without exposing credentials. Full snapshot sync is deliberate for this MVP.

Local libraries remain separated by authenticated user ID, with a separate guest library. Signing out returns to the guest library; signing in to another account loads that account's local/cloud copy. Guest vocabulary is not automatically uploaded into an account: export and import it when you want to move it. Cached account libraries remain on this browser until site data is cleared.

Pending changes and their last cloud revision are persisted locally. Reloading offline does not replace unsynced answers with an older cloud copy. Reconnection retries sync. If both copies changed, Settings offers **Keep this device** or **Use cloud copy**; neither copy is automatically merged. Export vocabulary before choosing because CSV contains words, not progress. Failed transport pauses sync; **Sync now** retries. Keep one Mori tab open per account when editing, since live cross-tab local reconciliation is not implemented. Returning focus reconciles the signed-in account.

Existing guest libraries and bundled Excel vocabulary are retained. Prior Supabase account IDs and Stack account IDs are different; this refactor does not automatically reassign or transfer a deployed Supabase account's cloud data. No deployed Supabase data was supplied for migration.

Live email delivery and the actual hosted Stack Auth/Prisma Postgres connection still require your project configuration. Tests use SDK HTTP fixtures and an isolated local PostgreSQL engine; they do not claim to verify your hosted accounts. See [backend setup and verification](docs/backend.md).

## Optional dictionary

No dictionary is downloaded or included in the client bundle. Obtain an uncompressed UTF-8 CC-CEDICT corpus from its official project and set server-only `CEDICT_PATH` to an absolute path. `GET /api/dictionary?q=學生` and `node --import tsx scripts/lookup-dictionary.ts 學生` return suggestions without overwriting values. Include the corpus as a server deployment asset if enabling this on Vercel; a developer machine path is not available remotely.

Dictionary attribution: [CC-CEDICT](https://cc-cedict.org/), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). No MDBG scraping. User-entered values always take priority.

## Limits

Cloud setup needs your Stack Auth project and Prisma Postgres database. No automatic cross-device conflict merge, background sync while the app is closed, account recovery UI, or OAuth. A sync conflict preserves the device copy for export. Local browser storage is not encrypted backup and can be removed by clearing site data. Optional CC-CEDICT is exact-match, server-side, and must be supplied separately. The supplied font's full-file size makes the first offline cache download larger. Pinyin alignment is deterministic, with uncertain cases flagged for manual review; it cannot infer contextual pronunciation from unmarked text. New releases require applying pending database migrations before deploying to Vercel.

## Verification — 11 November 2026

- **121 unit/integration tests** cover the original learning/import behavior, Stack Auth client adapter, account-scoped API access, invalid/oversized payloads, provider/database failures, and PostgreSQL persistence through the real Prisma client/pg adapter. Database tests run the actual migration command twice, check schema drift, round-trip all Excel entries, and test competing writes.
- **23 Chrome browser tests** against the production build cover the original UI, responsive layouts, imports, studying, independent progress/stars, undo, and offline reload.
- **16 configured-auth browser tests** exercise the real Stack browser SDK with HTTP fixtures; run `pnpm test:e2e:cloud`. This command builds with dummy public test keys, runs its tests, and automatically restores a build using your original environment afterward.
- `pnpm db:validate`, `pnpm typecheck`, `pnpm lint`, reproducible installation, and production builds all pass.
- Live Stack email delivery, real project credentials, hosted Prisma Postgres connectivity, and actual device installation remain deployment checks. No hosting deployment was performed.

### Character reference

“Character details” is an optional disclosure below a revealed study answer and in
the word editor. It replaces the saved per-character pronunciation display. It
never changes a card’s pronunciation, translation, or learning progress.

The bundled Dong Chinese Character Wiki snapshot (2025-12-27, latest advertised at
integration) covers 23,012 characters, including simplified and traditional forms.
Mori looks up exact characters without conversion. Explanations, functional
component roles, and historical references are shown only for the 3,501 entries
marked verified in the source. Basic definitions/common words can be available
without a verified explanation. All 55 distinct Han characters in the starter
workbook have verified entries and stroke data.

Stroke playback uses 9,562 Make Me a Hanzi drawings embedded in the official dump.
Play/pause, reset, step controls, and a position slider are supported. These are
reference drawings, not a guarantee of Taiwan Ministry of Education handwriting
forms or stroke order. Common words retain the source’s traditional spelling and
brief gloss; they are reference examples, not automatically added to the library.
Historical forms open source images/wiki pages online rather than redistributing
third-party image collections.

Data lives in `public/character-data/`, separate from app JavaScript and the account
database. Small Unicode-block dictionary shards load when details are opened;
larger stroke shards load only when Stroke order is opened. Successful loads are
stored in `mori-character-data-v1` CacheStorage and can be reopened offline,
including after a reload. Unopened reference blocks require an initial connection.
Storage may be evicted by the browser; errors offer retry without blocking study.
No external dictionary request, API key, or database migration is needed at runtime.

Update with `python3 scripts/import-character-wiki.py` (downloads the latest
advertised dump), or pass `--input /path/to/dictionary_char_YYYY-MM-DD.jsonl` to use
a local dump. Rebuild the app after updating. The manifest records provenance,
counts, and the input SHA-256. Do not remove the attribution/licence files:
dictionary adaptations remain CC BY-SA 4.0; stroke graphics retain the Arphic Public
License. The script intentionally excludes unverified etymologies and third-party
historical image binaries. Nothing is generated by AI.

### Public sets and folders / Explore

Explore (`/explore`) lists explicitly published sets and folders. Search matches title,
description and public creator name, case-insensitively. Results contain only
metadata, in pages of 20 ordered by most recently updated. Keyset pagination
does not depend on a previous result still existing. Discovery and shared-deck
responses are `no-store`; the service worker never caches API responses.
Browsing requires a connection. Copies saved to a personal library use the
existing account sync and offline storage, with independent IDs and progress.

In a set's Share dialog, “Anyone with the link” remains the default. “Public”
requires an explicitly chosen public name (2–50 characters) and allows a short
description. The name is remembered separately from auth/account data and shown
on the creator's shared sets; no email or auth display name is inferred. Saving a
new public name updates the creator's other shared snapshots. Publication is an
explicit snapshot including words, notes and examples. Editing or archiving a
personal set does not update/unpublish that snapshot. “Save as unlisted” removes
it from Explore while keeping the link; “Stop sharing” revokes it. Existing
recipients keep their copies.

Open a folder and choose **Share folder** (also in its three-dot menu). The same
Public/Unlisted controls apply. Publishing includes all non-empty, non-archived
sets and their active words, up to 100 sets / 5,000 words / 2 MB total. The dialog
lists the included sets. No separate set links are created or changed; a folder
snapshot is independent of any existing set shares. Moving, editing, archiving
or adding sets in the private folder does not update the snapshot automatically.
Recipients can expand each set to preview its words, then **Add folder to library**
to create a new folder with fresh set/word IDs and separate progress. Reopening
the same link offers the existing copy (restoring the folder if archived), with no
silent merges or overwrites. Individually archived copied sets stay archived.
Copies remain usable offline and after the owner unpublishes or revokes a link.
Explore includes an All/Sets/Folders filter; reports/moderation also cover folders.

Run `pnpm db:migrate` before deploying this version. Migration
`20261111120000_public_library` only adds sharing metadata, `creator_profile`, and
`deck_report`. It never rewrites `user_state`, account identities, progress, or
existing link IDs. Existing shares default to **unlisted**, and existing accounts
start without a public profile. Older clients can still update shared vocabulary
without silently changing its visibility. Migration `20261111150000_shared_folders`
adds kind/grouping/count fields and scopes the unique snapshot key to its kind.
Existing shares default to kind `set` and retain their IDs and visibility. No
personal folders are republished or rewritten, and no re-registration or auth
dashboard changes are needed. Apply both pending migrations before deployment.

Signed-in users can report a public set, once per account per set. Reports are
stored privately for manual review; they are not automatically judged or emailed.
There is no public rating system or automatic takedown based on report count.
An operator can review reports in their database console:

```sql
SELECT r.deck_id, d.name, r.reason, r.details, r.created_at
FROM deck_report r JOIN shared_deck d ON d.id = r.deck_id
ORDER BY r.created_at DESC;
```

After review, use a parameterized database query to set `shared_deck.suppressed`
to `true` for that deck ID. This immediately removes the listing **and** makes its
share URL unavailable. Owner updates do not clear this flag; the owner sees a
removal message in Share. Restoring requires an operator to set it back to false.
Deleting/revoking a shared snapshot cascades deletion of its reports. An admin UI,
user blocking, and automated moderation are outside this first version.
