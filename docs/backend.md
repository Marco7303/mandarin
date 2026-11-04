# Backend verification

The app works without hosted services. The supplied Excel workbook is compiled into its starter library; no live database is required for local studying.

## Automated checks

```sh
pnpm install --frozen-lockfile
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm test:e2e:cloud
```

`pnpm test` starts a disposable PGlite PostgreSQL engine on a random loopback TCP port. Tests use the real generated Prisma client and `@prisma/adapter-pg`, run `prisma migrate deploy`, repeat it to check idempotence, and compare the migrated database to the schema. No hosted database, persistent test data, or external account is used. PGlite multiplexes connections over one PostgreSQL engine; its competing-write tests do not replace load testing a hosted cluster.

API tests mock the authentication boundary and exercise ownership enforcement, request-owner changes, revision validation, conflicts, body streaming limits, and failures. Client tests mock the SDK and verify no-redirect credentials, auth notifications, error handling, correct headers, owner checks, and revision handling.

`pnpm test:e2e` tests the production application without credentials. It requires installed Chrome and a free port 3000.

`pnpm test:e2e:cloud` builds with clearly fake public project keys and tests the real Stack browser SDK against intercepted HTTP responses. All external browser requests are intercepted, and sync responses are controlled fixtures. It does not create accounts or send email. It verifies the existing form and SDK cookies as well as account switching and pending-write recovery. The runner automatically rebuilds with your original environment afterward, including when a test fails.

## Hosted smoke test after configuration

Use the variables documented in `.env.example` and the README. Keep secrets in `.env.local` or Vercel's environment settings; do not paste them into source or commit them.

1. Run `pnpm db:migrate` against the intended Prisma Postgres database. Run it again: no pending migrations should remain.
2. Start Mori, create account A, complete email verification if required, and sign in. Confirm the starter library contains 55 words and Settings reports **Synced**.
3. Review one Chinese front and star one English front. On a second browser/device, sign into A and verify the direction-specific progress and star arrive.
4. Sign out and create account B. Confirm B sees its own fresh library and none of A's progress. Switching back to A should restore A's cards.
5. With A signed in, go offline, review a card, and reload. The review should persist locally. Reconnect and confirm **Synced** after retry.
6. Edit A's library on two disconnected devices; reconnect both. Settings should offer the existing conflict choices. Check both **Keep this device** and **Use cloud copy** in separate trials.
7. Confirm `/api/sync` without authorization returns 401, malformed tokens cannot read another user's data, and no database URL/server key appears in the browser's JS or network responses.

A successful local suite cannot establish email delivery, domain allowlists, production database permissions/TLS, or hosted service availability. Those are the remaining checks after real projects are configured.
