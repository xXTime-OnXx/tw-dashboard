import { loadEnvFile } from 'node:process';
import { parseArgs } from 'node:util';
import { Archive } from './r2.ts';
import { keyInfo, configurations, hourly } from './parse.ts';
import { importGroup, importEvent, rememberManifest, type Group } from './import.ts';
import { connect } from '../../../packages/db/src/index.ts';
try {
  loadEnvFile('.env');
} catch {}
const { values } = parseArgs({
  options: {
    world: { type: 'string', default: 'de259' },
    mode: { type: 'string', default: 'incremental' },
    from: { type: 'string' },
    to: { type: 'string' },
    full: { type: 'boolean', default: false },
  },
});
if (
  !/^de\d+$/.test(values.world) ||
  !['incremental', 'backfill', 'reconcile', 'summaries'].includes(values.mode)
)
  throw Error('Invalid world/mode');
if (values.mode === 'backfill' && (!values.from || !values.to))
  throw Error('Backfill requires --from and --to');
for (const date of [values.from, values.to])
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))))
    throw Error('Dates must be YYYY-MM-DD');
if (values.from && values.to && values.from > values.to) throw Error('Invalid date range');
if (!process.env.DATABASE_URL) throw Error('DATABASE_URL required');
const db = connect(process.env.DATABASE_URL);
const archive = new Archive();
const world = values.world;
const [run] = await db`INSERT INTO importer_runs(world) VALUES(${world}) RETURNING id`;
try {
  if (values.mode === 'summaries') {
    await db`INSERT INTO player_daily(world,day,id,captured_at,points,villages,attack,defense,support,"all") SELECT DISTINCT ON(world,(captured_at AT TIME ZONE 'UTC')::date,id) world,(captured_at AT TIME ZONE 'UTC')::date,id,captured_at,points,villages,attack,defense,support,"all" FROM player_history WHERE world=${world} ORDER BY world,(captured_at AT TIME ZONE 'UTC')::date,id,captured_at DESC ON CONFLICT(world,day,id) DO UPDATE SET captured_at=EXCLUDED.captured_at,points=EXCLUDED.points,villages=EXCLUDED.villages,attack=EXCLUDED.attack,defense=EXCLUDED.defense,support=EXCLUDED.support,"all"=EXCLUDED."all"`;
  } else {
    const loadGroup = async (
      g: Omit<Group, 'objects'> & {
        objects: { key: string; dataset: string; expectedHash?: string }[];
      },
    ) => {
      await rememberManifest(db, g);
      if (
        (
          await db`SELECT 1 FROM import_groups WHERE world=${world} AND captured_at=${g.at} AND kind=${g.kind} AND status='complete'`
        ).length
      )
        return;
      const objects = [];
      for (const o of g.objects) objects.push({ ...o, body: await archive.get(o.key) });
      await importGroup(db, { ...g, objects });
      console.log(JSON.stringify({ action: 'import', world, at: g.at, kind: g.kind }));
    };
    if (values.mode === 'incremental') {
      for (const kind of ['snapshots', 'world-config']) {
        let manifest;
        try {
          manifest = await archive.json(`state/${world}/${kind}/latest.json`);
        } catch (e) {
          if ((e as { name: string }).name === 'NoSuchKey') continue;
          throw e;
        }
        if (manifest.world !== world || !Number.isFinite(Date.parse(manifest.captured_at)))
          throw Error('Invalid manifest');
        await loadGroup({
          world,
          at: manifest.captured_at,
          kind: kind === 'snapshots' ? 'hourly' : 'config',
          manifest,
          objects: manifest.snapshots.map((s: { key: string; name: string; sha256: string }) => {
            const info = keyInfo(s.key);
            if (
              !info ||
              info.world !== world ||
              info.dataset !== s.name ||
              +new Date(info.at) !== +new Date(manifest.captured_at)
            )
              throw Error('Manifest key mismatch');
            return { key: s.key, dataset: s.name, expectedHash: s.sha256 };
          }),
        });
      }
    } else {
      // Hold only one day's group keys and one collection's payloads in memory.
      const from =
        values.from ??
        (values.full
          ? '0000-00-00'
          : new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10));
      const to = values.to ?? new Date().toISOString().slice(0, 10);
      const dates = new Set<string>();
      if (values.full) {
        for await (const o of archive.list(`snapshots/${world}/`)) {
          const info = keyInfo(o.key);
          if (info) dates.add(info.at.slice(0, 10));
        }
      } else {
        for (let day = new Date(from); day <= new Date(to); day = new Date(+day + 86400000))
          dates.add(day.toISOString().slice(0, 10));
      }
      let failed = 0;
      for (const date of [...dates].sort()) {
        const groups = new Map<
          string,
          Omit<Group, 'objects'> & { objects: { key: string; dataset: string }[] }
        >();
        for (const dataset of [...hourly, ...configurations])
          for await (const o of archive.list(`snapshots/${world}/${dataset}/date=${date}/`)) {
            const info = keyInfo(o.key);
            if (!info) continue;
            const kind = configurations.includes(info.dataset) ? 'config' : 'hourly';
            const id = info.at + kind;
            const g = groups.get(id) ?? { world, at: info.at, kind, objects: [] };
            g.objects.push({ key: o.key, dataset: info.dataset });
            groups.set(id, g);
          }
        for (const g of [...groups.values()].sort((a, b) => a.at.localeCompare(b.at))) {
          try {
            await loadGroup(g);
          } catch {
            failed++;
            console.error(JSON.stringify({ action: 'group_failed', world, at: g.at }));
          }
        }
      }
      if (failed) throw Error(`${failed} groups failed; see import_groups`);
    }
    // Always revisit overlap prefixes. Full/backfill reconciles all requested event dates.
    const [w] = await db`SELECT conquest_checked_at FROM worlds WHERE world=${world}`;
    const cutoff =
      values.mode === 'incremental' && w?.conquest_checked_at
        ? new Date(+w.conquest_checked_at - 86400000).toISOString().slice(0, 10)
        : (values.from ??
          (values.mode === 'reconcile' && !values.full
            ? new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)
            : '0000-00-00'));
    const cursor = await archive.json(`state/${world}/conquest-cursor.json`).catch((e) => {
      if (e.name === 'NoSuchKey') return null;
      throw e;
    });
    async function* eventObjects() {
      if (cutoff === '0000-00-00') {
        yield* archive.list(`events/${world}/conquests/`);
        return;
      }
      const last = values.to ?? new Date().toISOString().slice(0, 10);
      for (let day = new Date(cutoff); day <= new Date(last); day = new Date(+day + 86400000)) {
        yield* archive.list(`events/${world}/conquests/date=${day.toISOString().slice(0, 10)}/`);
      }
    }
    for await (const o of eventObjects()) {
      const date = /date=(\d{4}-\d{2}-\d{2})/.exec(o.key)?.[1];
      if (!date || date < cutoff || (values.to && date > values.to)) continue;
      if ((await db`SELECT 1 FROM source_objects WHERE object_key=${o.key}`).length) continue;
      await importEvent(db, world, o.key, await archive.get(o.key));
    }
    for await (const o of archive.list(`state/${world}/conquest-checks/`)) {
      if ((await db`SELECT 1 FROM conquest_coverage WHERE object_key=${o.key}`).length) continue;
      const check = await archive.json(o.key);
      if (
        check.world !== world ||
        ![check.queried_from, check.queried_until, check.event_count].every(Number.isSafeInteger) ||
        check.queried_from > check.queried_until ||
        check.event_count < 0
      )
        throw Error('Invalid conquest coverage');
      // Publish coverage only after the matching event interval has been reconciled.
      if (
        new Date(check.queried_from * 1000).toISOString().slice(0, 10) < cutoff ||
        (values.to && new Date(check.queried_until * 1000).toISOString().slice(0, 10) > values.to)
      )
        continue;
      await db`INSERT INTO conquest_coverage(world,object_key,queried_from,queried_until,event_count) VALUES(${world},${o.key},${new Date(check.queried_from * 1000)},${new Date(check.queried_until * 1000)},${check.event_count}) ON CONFLICT DO NOTHING`;
    }
    if (cursor && values.mode !== 'backfill') {
      const checked = new Date(cursor.updated_at);
      if (!Number.isFinite(+checked)) throw Error('Invalid cursor');
      await db`INSERT INTO worlds(world,hostname,conquest_checked_at,imported_at) VALUES(${world},${world + '.die-staemme.de'},${checked},now()) ON CONFLICT(world) DO UPDATE SET conquest_checked_at=greatest(worlds.conquest_checked_at,EXCLUDED.conquest_checked_at),imported_at=now()`;
    }
  }
  await db`UPDATE importer_runs SET status='complete',completed_at=now() WHERE id=${run.id}`;
} catch (e) {
  await db`UPDATE importer_runs SET status='failed',completed_at=now(),error=${e instanceof Error ? e.message : 'Import failed'} WHERE id=${run.id}`;
  console.error('Import failed; inspect authenticated data status and import_groups.');
  process.exitCode = 1;
} finally {
  await db.end();
}
