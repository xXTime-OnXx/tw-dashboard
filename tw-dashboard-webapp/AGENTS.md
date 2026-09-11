# Repository guidance

## Read first

- Read `docs/dashboard-plan.md` before dashboard work.
- Read `../tw-data-service/README.md` before ingestion or data-contract work.
- Inspect implementation and tests: documentation does not prove completion or production coverage.
- Follow more specific AGENTS.md files when present.

## Product and scope

Build a private Tribal Wars intelligence dashboard for one owner. First release: player perspectives, nearby analytics, profiles, evidence flags, interactive map, private annotations. Reports, historical playback, tribe comparisons, and alerts are later milestones; do not expand scope without a user request.

## Architecture

- New application and importer code uses TypeScript. Preserve the Python collector.
- React/Vite, TanStack Router/Query/Table, Tailwind/shadcn, Recharts, deck.gl OrthographicView.
- Hono on Cloudflare Workers; Neon PostgreSQL, Drizzle migrations, Hyperdrive.
- Private R2 archive; Node.js importer in GitHub Actions; Cloudflare Access restricted to owner.
- Use pnpm and the committed lockfile.

## Data correctness

- Scope game IDs by world. Snapshot times are observations, not exact activity times.
- Separate current published state from history. Publish complete validated groups transactionally.
- Imports must be resumable/idempotent; older backfills cannot replace current state.
- Reuse conquest IDs; retain unresolved references, provenance, gaps, and counter corrections.
- Missing ranking rows are unknown unless verified otherwise. Never invent conquests from ownership differences.
- Public statistics do not establish online status, troops, or intent. Player bashpoints are world-wide.

## Security

- Never expose or commit secrets. Keep credentials server-side, archives private, APIs and alternate URLs protected.
- Validate Access JWTs and owner identity. Isolate test databases; no destructive production tests.
- Do not log private reports or notes. Treat future uploads as untrusted.

## Working conventions

- Inspect status/code before changes and preserve unrelated work.
- Implement the earliest unfinished milestone unless directed otherwise.
- Share calculations; use explicit migrations; never fabricate schemas, status, or test results.
- Do not spawn subagents unless user or applicable instructions request it.

## Verification

- Run relevant repository-defined checks; test queries/imports against PostgreSQL.
- Cover replay, partial data, baselines, and access rejection.
- Run collector tests when collector code or collection workflows change.
- Verify major UI changes in a browser at narrow desktop widths.
- Document unavailable checks honestly.

## Handoff

- Keep `docs/dashboard-plan.md` aligned with accepted decisions, verified assumptions, and remaining work.
- Mark milestones complete only when acceptance criteria pass. Keep progress in the plan, stable guidance here.
- End with changes, checks, limitations, and the next unfinished milestone.

## Neon workspace

- Neon skills are installed in `.agents/skills`; read the relevant skill for Neon operations.
- `.neon` may point at production. Never infer authorization for production writes from a local connection file.
- `.env.local` contains Neon-managed secrets and is ignored. Keep tests on explicit isolated `_test` databases.
- The local Vite adapter accepts loopback databases only. Use LOCAL_DATABASE_URL for local preview.
- `neon deploy` reconciles `neon.ts`; it does not deploy the Cloudflare frontend or apply dashboard SQL migrations.
