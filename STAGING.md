# Writing practice preview

Branch: `feature/writing-practice`

Baseline: `7a7b357` (before any writing feature implementation).

This branch currently contains the existing app only. Vercel deploys it to
Preview; `main` remains the production branch.

The preview has no auth or database environment variables. Test libraries and
progress stay in the browser on the preview origin. Import a spreadsheet or
create a set to test. Production accounts, cloud sync and community sharing
are unavailable here.

The preview build deliberately skips database migrations. Do not copy production
credentials into Preview. Account testing requires separate test services.

Discarding this branch leaves production unchanged. Before merging future
feature changes, retain the production migration build command on `main` and
exclude this preview-only setup from the merge.
