# Tribal Wars dashboard: implementation and agent handoff

## Goal and accepted scope

Private web application for understanding nearby players, growth, combat statistics and territorial changes alongside the game in a 700px desktop window. First release: perspective selection, nearby table, profiles, charts, evidence flags, map, notes, relationship tags and watchlists. Later: report imports, historical playback, tribe comparisons and alerts. These later features require separate specifications.

## Architecture

React/TypeScript/Vite; Tailwind/shadcn-style components; TanStack Router/Query/Table; Recharts; deck.gl Cartesian OrthographicView. Hono API on Cloudflare Workers with static assets. Neon PostgreSQL through Hyperdrive, Drizzle schema and explicit SQL migrations. Node TypeScript importer in GitHub Actions. Existing R2 archive and Python collector remain operational. Access is restricted to the owner through Cloudflare Access.

Workspace: `tw-dashboard-webapp/` contains apps/dashboard (UI/Worker), apps/importer (normalization/CLI), packages/db (schema/migrations/queries), packages/contracts (Zod/types), packages/analytics (pure calculations), docs (plan/runbook), and its AGENTS.md (durable dashboard instructions). The sibling `tw-data-service/` contains the Python collector. pnpm uses pinned dependencies and a lockfile. All new application code is TypeScript.

## Verified collector contract

Source: `../tw-data-service/README.md` and implementation. de259 scheduled; CLI supports other worlds on die-staemme.de. Ten hourly datasets: players, villages, tribes, player-kills-attack, player-kills-defense, player-kills-support, player-kills-all, tribe-kills-attack, tribe-kills-defense, tribe-kills-all. Three manual XML datasets: world-config, unit-info, building-info. No tribe support ranking, village building inventory, troop inventory, reports or online status.

Keys: snapshots/<world>/<dataset>/date=YYYY-MM-DD/hour=HH/<YYYYMMDDTHHMMSSZ>.gz. Latest manifests: state/<world>/snapshots/latest.json and state/<world>/world-config/latest.json. Only latest manifests are retained. Individual JSON conquests: events/<world>/conquests/date=YYYY-MM-DD/hour=HH/<event-id>.json. Cursor: state/<world>/conquest-cursor.json. Reuse SHA-256 event IDs. Initial conquest lookback is one hour; schedule every five minutes with two-minute overlap. Hourly schedule minute 17. These are schedules, not freshness guarantees.

Snapshot timestamp is assigned before sequential downloads; never describe it as atomic game state or exact activity time. World config describes rules, not individual village state.

## Import contract

Audit representative R2 samples before accepting parsers. Record column order/name encoding and missing ranking semantics. Missing ranking rows stay unknown. Paginate listings; group by world and exact collection time. Validate all ten hourly datasets, or three configuration datasets separately. Missing config does not block player analytics. Decode gzip once; verify expected hashes only against preserved manifests. Newly computed hashes for legacy objects are provenance, not independent verification.

Persist immutable observed manifests, object ledger, group status/errors, timestamps and checkpoints. Reconstructed old groups are explicitly marked reconstructed. Quarantine incomplete/malformed groups. Stage and publish one complete group transactionally; serialize per world; replay safely; do not let old backfill replace newer current state. Unresolved conquest references are allowed. Retain history when entities disappear. Advance checkpoints only after persistence. Preserve last good published state on failure.

Pipeline: collector → R2 → importer → PostgreSQL → API → UI. Dependent import jobs follow each successful collector; failures distinguish collection from import. Daily recent reconciliation and weekly full archive reconciliation. Bounded resumable backfill, incremental, reconcile and summary rebuild commands. Pagination/batches bound memory. Use direct PostgreSQL for importer; Hyperdrive for API.

## Persistence

World-scoped entities; complete observation history and current published pointer; conquest original IDs/time/owners; configuration history; import provenance/status; daily chart summaries; owner-scoped preferences/annotations. Partition large hourly history monthly, index world/entity/time and village coordinates. Counters use bigint, serialized as decimal strings to avoid JS integer loss. Daily summaries do not replace retained hourly history. No automatic raw-history deletion.

## Product rules

Start de259, English, dark mode, UTC storage/browser-local display. Default radius 20, any current village of chosen perspective; optional single village. Euclidean distance inclusive boundary; deduplicate players; local village count and nearest distance. Exclude perspective; optional tribe filter; barbarians map-only. Profile selection does not switch perspective. URL stores filters/perspective/window; private defaults stored server-side. Current anchor villages remain fixed across comparisons.

Table: player/tribe/rank/points/villages/distance/local count, attack/defense/support/total bashpoints, deltas, conquests gained/lost, evidence and private labels. Profiles: current summary, freshness, charts, villages, conquest/tribe history, notes/tags/watchlist and game links. Relationship values hostile/friendly/neutral/unknown, independent watchlist.

Windows: 24h, 7d, 30d. Latest complete observation at/before boundary is baseline only if no more than two hours older. Expose timestamps. Signed changes preserved; zero or missing baseline means no percentage. Missing values remain unknown. Player statistics are world-wide, not attributable to nearby villages.

Evidence: acquisition inside radius; acquired village closer than nearest at baseline against fixed current anchors; positive offensive delta; percentage points growth above perspective with valid baselines; adjacent tribe-ID changes. No-observed-changes requires all tracked values unchanged, no conquests and sufficiently covered interval; absent/uncertain coverage yields insufficient data. Each flag exposes numbers/window/supporting observations. No threat score, online prediction or troop inference.

Map: Cartesian y increasing downward like game, pan/zoom, coordinate search, continent grid, selection, tribe/relationship colors, perspective/selected highlights, radius coverage, recent conquests. Viewport-bounded requests, simplified far rendering, tooltips and village panel. WebGL failure offers table. Resizable panels, no page overflow at 700px.

Freshness: published snapshot, conquest collector cursor timestamp and successful DB import separately. Stale thresholds 2h snapshots/15min conquest check. No-event periods are not collector failure. Poll visible every 60s and on focus.

## API and security

/api/v1 worlds/status, player search/surroundings, profiles/series/villages/events, viewport villages, preferences/annotations/watchlists. Shared Zod schemas; bounded radii/viewports/ranges/page sizes and allowlisted sorts; structured errors and coverage metadata. Coherent published snapshot ID per response; independent conquest freshness. Short charts hourly, longer daily; bounded hourly detail available.

Access on entire hostname, exact owner email, initial OTP. Verify JWT signature/issuer/audience/expiry/email in API. Disable/protect workers.dev and preview routes. Reject cross-origin mutations, no shared private response caching. Credentials only server-side; private R2. Separate runtime/importer/migration DB roles. Owner email and production hostname are configuration, not committed secrets.

Operations: structured logs without secrets/notes/reports, import failure status, storage monitoring, separate dev/production. PR CI never imports/migrates production. Explicit migrations and rollback-compatible rollout. Backups and restore rehearsal before launch. Costs measured from archive, not guessed.

## Milestones (acceptance governs completion)

- [x] M0: handoff + source audit: plan, AGENTS, representative schema verification, coverage and storage estimate.
- [ ] M1: workspace/local DB/CI/protected shell: owner login tested and alternate routes denied.
- [x] M2: parsers/history/staging/backfill/checkpoints/workflows: safe replay/reordering, failed groups unpublished.
- [x] M3: radius/baseline/profile/event/status APIs: expected PostgreSQL fixture results pass.
- [x] M4: table/profiles/charts/filters/private annotations: end-to-end workflow verified.
- [x] M5: evidence/map: table/map agree, evidence traceable and uncertainty visible.
- [ ] M6: production readiness: performance, backup restore, operational docs and access verified.

## Verification

Vitest pure logic; PostgreSQL integration for imports/queries; Playwright for core flows/security/narrow window. Python tests when collection workflows change. Cases: partial groups, malformed gzip/CSV, encoded names, missing rankings, duplicate conquests, unknown entities, interrupted/backdated imports, absent/zero baselines, overlapping radii, boundary villages, tribe changes, counter corrections. Target warm API under 1s/map under 2s on documented representative world. Do not mark fixture-only timing as production performance.

## Later report milestone

Obtain representative German-account export; specify one format. Paste/upload → parser preview → confirmation → deduplication/matching. Preserve provenance/time and allow deletion. Unknown ≠ zero; old troops ≠ current strength. Never execute uploaded content.

## Implementation record

See the final verification section below for actual implementation, checks, deviations and remaining deployment tasks. Do not infer completion from this specification.

### R2 audit (2026-09-10)

Read-only audit of latest manifest at 2026-09-10T14:22:01Z: 10 datasets, 10,223 players, 28,546 villages, 396 tribes. Exactly one player snapshot existed in the archive at audit time. No historical comparison is currently possible from that snapshot alone.
Verified CSV orders: player=id,name,tribe,villages,points,rank; village=id,name,x,y,owner,points,rank; tribe=id,name,tag,members,villages,points,all_points,rank; rankings=rank,id,value. Names use percent encoding and '+' for spaces (e.g. Tramm%27s+Dorf). Ranking counts: attack 1,331; defense 3,054; support 350; all 3,775; missing rows remain unknown. Raw orphan ranking IDs are retained independently.
Latest compressed payload total is approximately 0.64 MB (about 15 MB/day at 24 observations); PostgreSQL row+index growth must be measured after importing representative data rather than equating compressed size with SQL size.

### Coverage addition

The collector now archives successful conquest query intervals after persisting returned events and before advancing its cursor. This is a small metadata extension, not a collector rewrite. The importer retains these intervals separately. A no-observed-changes flag requires continuous snapshot/entity coverage, known counters, continuous imported conquest-query coverage and no events/changes. Legacy cursor-only archives never produce this flag.

## Verified implementation status — 2026-09-10

M0 and M2–M5 are implemented and locally verified. M1's code/local setup is complete, but its real owner-login acceptance check awaits Cloudflare configuration. M6 remains open for production setup and provider recovery verification. No code has been committed or pushed in this session, so new workflows and the collector coverage extension are not yet active on GitHub.

Delivered workspace: React dashboard, Hono Worker, authenticated routes, PostgreSQL schema and Drizzle migrations, resumable R2 importer, analytics, private assessments, profiles/charts, WebGL map and ownership history, CI and import workflows, setup/config generator, plan and AGENTS instructions. Current-state reads use the published history pointer rather than duplicate mutable entity tables; this keeps an hourly group coherent and preserves vanished entities. New conquests are queried up to their independently imported collection cursor, so they appear between hourly snapshots.

Map rendering now uses the six official village point appearances: 0–299, 300–999, 1,000–2,999, 3,000–8,999, 9,000–10,999 and 11,000+. Generated terrain and settlement sprites provide the visual base; settlement scale communicates points, small color markers communicate tribe or relationship, special rings communicate perspective/selection/recent conquests, and smart labels prioritize anchors, conquests and strongholds. The default map view fits the chosen player radius and adds local field grids, continent labels, viewport counts and a visible point-stage key.

Verification completed:

- TypeScript typecheck and production Vite build.
- Vitest: 17 unit/security/PostgreSQL integration tests; includes replay, failed-group retry, checksums, unknown counters, coverage, intermediate tribe changes, independent conquest freshness and annotation isolation.
- Playwright: 2 browser workflows, including 700px overflow check, profile selection without perspective switch, note save/reload, filtering, map viewport count, actual village picking and status page.
- Python collector: 14 tests, including events → coverage → cursor write ordering and failure behavior.
- Wrangler production Worker dry-run bundle (no Cloudflare deployment).
- Formatting and tracked diff whitespace checks.
- Production dependency audit: zero reported advisories after updates, including Neon config packages.

Real-world local validation: one hourly snapshot (10,223 players, 28,546 villages, 396 tribes), three configuration payloads, 558 conquests. Local PostgreSQL 17.6 in Docker, Node 25.1.0 on this host; CI pins Node 22.18.0 (supported by dependencies). Final radius runs: 172ms cold and 119ms warm; entire-world map: 122ms. These are local single-snapshot timings, not remote or lifetime-history guarantees.

Storage: hourly player/village/tribe tables and indexes occupy 8,142,848 bytes for the audited world. At unchanged entity counts this is roughly 195 MB/day or 5.9 GB/30 days of hourly history, before events, daily summaries and other overhead. Current database totals about 18.5 MB. This measured estimate reinforces using PostgreSQL with adequate paid storage rather than D1 or an undersized free database tier.

Local restore rehearsal: pg_dump/pg_restore into a distinct disposable database preserved 10,223 player observations, 28,546 village observations, 558 conquest events and two complete import groups; final migrations also succeed on the restored database. This does not certify Neon backup retention or production restore readiness.

Neon setup completed at user request: global CLI login, webapp-local agent skills, MCP configuration, project `tw-data` (`fancy-cherry-84839351`) / branch production (`br-purple-morning-b2xsg4i4`), @neon/config and @neon/env dependencies, exact empty neon.ts, and successful neon deploy (no remote changes required). Connection files live in the webapp folder and are ignored. Empty neon.ts provisions no additional services and does not apply this dashboard's SQL migrations or deploy its Worker. Local Vite refuses remote database URLs to avoid accidentally using the pulled production credentials.

Production Neon database setup completed at user request on 2026-09-10: all three reviewed Drizzle migrations were first validated on the expiring `setup-migration-test-20260910` child branch, then applied to `production/neondb` (15 application tables). Ordinary non-superuser `tw_importer` and `tw_runtime` login roles were created through PostgreSQL, least-privilege grants and partition-parent ownership were applied, and live connection tests confirmed that runtime can read application tables and update private preferences but cannot write ingestion tables. Generated direct role URLs are kept only in ignored `.env.neon-roles` with mode 0600. The current Neon plan exposes only six hours of recovery history and does not permit protected branches, so the requested seven-day recovery window and production branch protection remain provider-plan blockers.

Repository organization updated at user request: all dashboard workspace files, documentation, local tooling, Neon configuration, agent skills and ignored local state live under `tw-dashboard-webapp/`. The Python collector remains in sibling `tw-data-service/`. Repository-level GitHub workflow entry points remain under `.github/workflows/`, GitHub's required discovery location, and execute dashboard jobs with `tw-dashboard-webapp` as their working directory.

### Next unfinished work

From `tw-dashboard-webapp/`, follow docs/setup.md for the remaining provider work: configure Hyperdrive with caching disabled, exact owner email and full-hostname Access policy, generated Worker deployment settings, and GitHub production-data secrets. Then deploy the Worker, verify owner/unauthorized access, observe a live collector/import cycle, and record provider backup/restore settings. Upgrade or otherwise adjust the Neon plan before requiring seven-day recovery history and production branch protection. Commit/push only when requested or as part of the user's chosen release workflow. Do not enable later milestones opportunistically.
