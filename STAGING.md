# Writing practice preview

Branch: `feature/writing-practice`

Baseline: `7a7b357` (before any writing feature implementation).

This branch adds browser-based writing practice. Vercel deploys it to Preview;
`main` remains the production branch. Push this branch to update the testing site.

In Study options choose Writing, then Trace, Copy or Recall. Choose the word
batch, prompt and order before starting. Checking runs on the learner’s device
with Hanzi Writer 3.7.3 (MIT) and Mori’s existing licensed stroke paths. No AI
service, per-stroke server requests or database migrations are involved.

Writing results are session-only and do not change flashcard learned status.
Unsupported characters can be skipped. Stroke checking follows the supplied
reference; Taiwan stroke-order variants are not all covered. Test on real iOS
and Android phones before promoting the feature. Offline practice needs its JS
and selected stroke data to have loaded once online.

The preview has no auth or database environment variables. Test libraries and
progress stay in the browser on the preview origin. Import a spreadsheet or
create a set to test. Production accounts, cloud sync and community sharing
are unavailable here.

The preview build deliberately skips database migrations. Do not copy production
credentials into Preview. Account testing requires separate test services.

Discarding this branch leaves production unchanged. Before merging future
feature changes, retain the production migration build command on `main` and
exclude this preview-only setup from the merge.
