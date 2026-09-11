# Watchtower — Tribal Wars dashboard

Private player and territorial intelligence built alongside the existing Python collector.

Read [the implementation plan](docs/dashboard-plan.md) and [agent guidance](AGENTS.md). See [step-by-step provider setup](docs/setup.md) and [deployment and recovery](docs/operations.md) before provisioning production.

## Local development

Requires Node 22.18+ (or a supported newer Node), pnpm 10.26.2, and Docker.

```sh
pnpm install --frozen-lockfile
docker compose up -d db
cp .env.example .env
# Set DATABASE_URL in .env. R2 values are needed only for imports.
node --env-file=.env --import=tsx packages/db/src/migrate.ts
pnpm dev
```

The local-only Vite API adapter uses owner `local@localhost` on loopback. It is not included in the production Worker. Empty databases show setup/empty states; no mock data is shown as real intelligence.

## Data import

Set DATABASE_URL and R2 credentials in your environment, then:

```sh
pnpm data:import --world de259 --mode incremental
pnpm data:import --world de259 --mode backfill --from 2026-09-10 --to 2026-09-11
pnpm data:import --world de259 --mode reconcile --full
pnpm data:import --world de259 --mode summaries
```

`pnpm audit:archive` reads representative public-world R2 samples without changing the archive. Existing collector credentials can be loaded from its ignored .env file by this audit. Never copy secrets into tracked files.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
# Create an isolated database whose name ends _test, then export TEST_DATABASE_URL.
pnpm test:integration
pnpm db:seed
pnpm exec playwright install chromium
pnpm test:e2e
```

Integration tests skip explicitly when TEST_DATABASE_URL is absent. `db:seed` targets only that test database and seeds clearly synthetic entities for browser tests. Production data is never used by CI.
