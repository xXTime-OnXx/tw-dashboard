# Deployment, monitoring and recovery

## Production prerequisites

Create a Neon PostgreSQL database in a suitable European region. Measure real archive growth before selecting the tier; do not extrapolate compressed R2 bytes directly to SQL storage. Enable point-in-time recovery with an agreed retention window in the provider console.

Apply reviewed SQL migrations with a migration role via `pnpm db:migrate` and DATABASE_URL. The importer creates monthly partitions, so its role needs ownership of the history parents and CREATE in the application schema; never use that role in the API. Runtime role needs SELECT on intelligence/status tables and SELECT/INSERT/UPDATE on preferences/annotations only. Grant default SELECT privileges for newly created partitions. Store secrets in GitHub/Cloudflare, never in files committed to Git.

Create Hyperdrive against the runtime database role, with query caching disabled so published snapshot and annotation reads cannot serve mismatched stale results. Configure the real Hyperdrive ID under `hyperdrive: [{ binding: "HYPERDRIVE", id: "..." }]` in deployment configuration. Do not deploy placeholder bindings.

Configure Worker variables ACCESS_ISSUER (https://TEAM.cloudflareaccess.com), ACCESS_AUD, OWNER_EMAIL (exact email), and APP_ORIGIN (https://chosen-hostname). Without an owned domain, enable the exact `tw-dashboard.<account>.workers.dev` production route and protect the Worker itself with Access. With an owned domain, add a custom-domain route and disable `workers.dev`. Keep preview_urls=false and run_worker_first=true. The Worker validates authentication on assets and API. If any setting is missing or does not match the request, it fails closed.

Create Cloudflare Access protection with an Allow policy containing only the owner email and email OTP login. Prefer Worker-level Access for a `workers.dev` release so every attached route is covered; use hostname-based Access for a custom domain. No bypass policy. A first Worker deployment may use a deliberately invalid placeholder audience only to create the fail-closed Worker before enabling Worker-level Access; replace it immediately after copying the real AUD. Verify a second identity and direct routes are rejected. Local Vite authentication bypass is intentionally separate from the Worker.

Build using `pnpm build`; deploy from apps/dashboard using its Wrangler script only after real bindings/auth/domain are configured. No automatic production deployment is configured. Keep existing collector workflows active.

Configure GitHub environment production-data with IMPORT_DATABASE_URL and R2 credentials. `import-data.yml` follows successful trusted default-branch collection workflows, plus daily reconciliation (full on Sundays). Manual configuration collection for worlds other than de259 must be followed by a manual import specifying that world. Production schema migrations are explicit, never performed on PRs or automatically by the importer.

## Monitoring

Authenticated Data status shows published snapshot, conquest check cursor and import completion separately, failed groups, recent jobs, history count and database bytes. Snapshot stale after 2h, conquest checks after 15m. Inspect GitHub failures if a run never reaches the database. Import runs left running after timeout indicate interrupted work; retry safely. No external notifications are configured by the app.

Raw R2 storage is immutable from the TypeScript importer: it has read-only archive responsibilities. Review bucket public-access settings and provider storage metrics. Archive audit reports entity counts, compressed sample size and available player history.

## Recovery rehearsal

1. Export a database with pg_dump into a private directory or use a Neon recovery branch.
2. Restore into a separate disposable database with pg_restore; never overwrite production during rehearsal.
3. Apply any pending reviewed migrations and compare complete-group/entity/event counts and published timestamp.
4. Start an isolated app against the restored database and verify radius queries, profiles and annotations.
5. Re-run incremental import and confirm duplicate counts are unchanged.
6. Record the date, database size, restore duration and verification results below. Remove the temporary copy under your retention policy.

For application rollback, deploy the previous compatible Worker build. Prefer additive migrations; do not drop columns in the same release that removes their usage. If an import fails, the last successful snapshot remains published. Fix its input/parser and replay that group or bounded backfill. Historical backfill never rewinds the published pointer.

## Release checklist

- [ ] Real owner identity, Access policy and custom hostname tested.
- [ ] Hyperdrive configured with the `tw_runtime` role and query caching disabled.
- [x] Production schema migrated; separate `tw_importer`, `tw_runtime` and migration-owner roles configured and permission-tested (2026-09-10).
- [ ] Increase Neon recovery retention from the plan-limited 6 hours to at least 7 days and protect the production branch when the account plan supports both settings.
- [ ] Restore rehearsal completed (local fixture rehearsal is not production evidence).
- [ ] Representative-world API/map timings recorded.
- [ ] GitHub production-data secrets configured; successful collection/import observed.
- [ ] Alternate URLs, invalid/expired JWTs and cross-origin mutations rejected.

## Local rehearsal record (2026-09-10)

PostgreSQL 17.6 Docker backup/restore succeeded into `tw_dashboard_restore_test`: 10,223 players, 28,546 villages, 558 conquests, two complete groups. Combined local dump/create/restore/count commands took under one second for this approximately 18.5 MB database. Final Drizzle migrations succeeded on the restored database. Production Neon retention and restore are still unchecked.
