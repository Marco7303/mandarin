# Mori 森

A calm, mobile-first Taiwanese Mandarin flashcard app. Next.js App Router, React, TypeScript, Supabase Auth/PostgreSQL, and plain responsive CSS. No audio, stroke order, or response-time tracking.

## Run

Node 22+ and pnpm 10+ recommended.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000. The app works immediately in local mode with **Mandarin Class → Unit 1**, imported from the supplied workbook. Browser storage preserves vocabulary, preferences, direction-specific stars, and review results. Local mode is not a simulated sign-in; cloud accounts require Supabase configuration.

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm start
pnpm test:e2e
```

Browser tests use installed Google Chrome (`channel: 'chrome'`). Install Chrome, or remove `channel` from `playwright.config.ts` and run `pnpm exec playwright install chromium`. `pnpm test:e2e` builds and tests the production server, including offline reload; the test server reuses port 3000 when available. Stop a development server before launching a production server on that port.

## Features

- Folder/set create, rename, move, duplicate, archive, restore; multi-set and folder study.
- Create/edit/duplicate/archive/delete words; optional notes, tags, contextual pronunciation alignment.
- Chinese, Pinyin, English, and mixed prompts. Each word has exactly three independent progress/star dimensions. Mixed and starred are selection modes only.
- Reveal, Know/Still learning, undo, swipe, and keyboard controls. Mistakes return once later in the session and are due tomorrow.
- Review scheduling follows 2, 5, 14, 30, 60 days for consecutive correct answers, gradually rising to 180; `Scheduler` is replaceable.
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

## Supabase and Vercel

1. Create a Supabase project. Enable email/password authentication.
2. Run `supabase/migrations/202611030001_library.sql` in its SQL editor, or link the Supabase CLI and run `supabase db push`.
3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. No service-role key is used.
4. Set Supabase Auth Site URL/allowed redirects to your local/deployed URL. Confirm account email when required.
5. In Vercel import this **mandarin directory** as the project root. Framework: Next.js; install `pnpm install --frozen-lockfile`; build `pnpm build`. Add the same two environment values and deploy.
6. Use two test accounts to verify ownership isolation and the RLS checks listed in [supabase/README.md](supabase/README.md).

A single owner-protected JSONB snapshot makes library sync atomic. Server Zod validation checks collection limits, direction keys, counters, references, and IDs. Auth tokens are verified on the server; RLS applies to every database operation. Optimistic revisions prevent silent overwrites from concurrent devices. Full snapshot sync is deliberate for this MVP, not an unlimited-scale normalized vocabulary database.

Local libraries are separated by authenticated user ID, with a separate guest library. Signing out returns to the guest library; signing in to another account loads that account's local/cloud copy. Guest vocabulary is not automatically uploaded into an account: export and import it when you want to move it. Cached account libraries remain on this browser until site data is cleared, so shared-device users should clear site data after signing out.

Pending changes and their last cloud revision are persisted locally. Reloading while offline does not replace unsynced answers with an older cloud copy. Reconnection retries sync. If both copies changed, Settings offers **Keep this device** or **Use cloud copy**; neither copy is automatically merged. Export vocabulary before choosing because CSV contains words, not progress. Failed transport pauses sync without repeated background requests; **Sync now** in Settings retries. Keep one Mori tab open per account when editing, since live cross-tab local reconciliation is not implemented.

Live email delivery, Auth, database migration execution, and cross-account RLS require a real project and were **not verified without credentials**. Local tests do not substitute for those deployment checks.

## Optional dictionary

No dictionary is downloaded or included in the client bundle. Obtain an uncompressed UTF-8 CC-CEDICT corpus from its official project and set server-only `CEDICT_PATH` to an absolute path. `GET /api/dictionary?q=學生` and `node --import tsx scripts/lookup-dictionary.ts 學生` return suggestions without overwriting values. Include the corpus as a server deployment asset if enabling this on Vercel; a developer machine path is not available remotely.

Dictionary attribution: [CC-CEDICT](https://cc-cedict.org/), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). No MDBG scraping. User-entered values always take priority.

## Limits

Cloud setup needs your Supabase project. No automatic cross-device conflict merge, background sync while the app is closed, account recovery UI, or OAuth. A sync conflict preserves the device copy for export. Local browser storage is not encrypted backup and can be removed by clearing site data. Optional CC-CEDICT is exact-match, server-side, and must be supplied separately. The supplied font's full-file size makes the first offline cache download larger. Pinyin alignment is deterministic, with uncertain cases flagged for manual review; it cannot infer contextual pronunciation from unmarked text. The app is ready for Vercel setup; it has not been published to a hosting account.

## Verification — 3 November 2026

- **23/23 unit tests:** Pinyin/neutral tones/ü, contextual character alignment, scheduling, independent progress/star keys, tabular/vertical imports, editable preview validation, ZIP safety, safe CSV round trips, dictionary parsing, cloud validation, and real workbook.
- **10/10 Playwright tests** in Chrome against the production server: folder/set/word creation, manual pronunciation persistence, independent Chinese/English reviews, English-only stars, starred study, eligible mixed fronts, undo/repeats, CSV/XLSX/vertical imports, corrected import errors, PWA manifest/offline reload with persisted progress, API access rejection, and responsive home/study screens at 390×844, 768×1024, and 1440×900.
- `pnpm typecheck`, `pnpm lint`, and `pnpm build` all pass.
- Live Supabase sign-in/email delivery/migration/RLS tests and actual device installation remain deployment checks requiring your account and devices. No hosting deployment was performed.
