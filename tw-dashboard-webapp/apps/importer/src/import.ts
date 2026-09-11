import type { DB } from '../../../packages/db/src/index.ts';
import { hourly, configurations, parseHourly, parseConfig, parseConquest, sha } from './parse.ts';
export type Group = {
  world: string;
  at: string;
  kind: 'hourly' | 'config';
  objects: { key: string; dataset: string; body: Buffer; expectedHash?: string }[];
  manifest?: unknown;
};
export async function rememberManifest(
  db: DB,
  g: Pick<Group, 'world' | 'at' | 'kind' | 'manifest'>,
) {
  if (g.manifest)
    await db`INSERT INTO manifests(world,captured_at,kind,content_hash,payload) VALUES(${g.world},${g.at},${g.kind},${sha(JSON.stringify(g.manifest))},${db.json(g.manifest as never)}) ON CONFLICT DO NOTHING`;
}
export async function importGroup(db: DB, g: Group) {
  await rememberManifest(db, g);
  try {
    const names = g.objects.map((o) => o.dataset);
    const expected = g.kind === 'hourly' ? hourly : configurations;
    if (
      names.length !== expected.length ||
      new Set(names).size !== expected.length ||
      expected.some((n) => !names.includes(n))
    )
      throw Error('Incomplete dataset group');
    for (const o of g.objects)
      if (o.expectedHash && o.expectedHash !== sha(o.body)) throw Error('Checksum mismatch');
    const parsed =
      g.kind === 'hourly' ? parseHourly(new Map(g.objects.map((o) => [o.dataset, o.body]))) : null;
    const configs =
      g.kind === 'config'
        ? g.objects.map((o) => ({ dataset: o.dataset, payload: parseConfig(o.body) }))
        : [];
    await db.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${g.world}))`;
      if (
        (
          await tx`SELECT 1 FROM import_groups WHERE world=${g.world} AND captured_at=${g.at} AND kind=${g.kind} AND status='complete'`
        ).length
      )
        return;
      await tx`INSERT INTO worlds(world,hostname) VALUES(${g.world},${g.world + '.die-staemme.de'}) ON CONFLICT DO NOTHING`;
      if (parsed) {
        const date = new Date(g.at),
          start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)),
          end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
        const suffix = start.toISOString().slice(0, 7).replace('-', '_');
        await tx`SELECT pg_advisory_xact_lock(hashtext(${'partition:' + suffix}))`;
        for (const table of ['player_history', 'village_history', 'tribe_history'])
          await tx.unsafe(
            `CREATE TABLE IF NOT EXISTS ${table}_${suffix} PARTITION OF ${table} FOR VALUES FROM ('${start.toISOString()}') TO ('${end.toISOString()}')`,
          );
        const collections: { table: string; rows: Record<string, unknown>[] }[] = [
          { table: 'player_history', rows: parsed.players },
          { table: 'village_history', rows: parsed.villages },
          {
            table: 'tribe_history',
            rows: parsed.tribes.map(({ allPoints, ...r }) => ({ ...r, all_points: allPoints })),
          },
        ];
        for (const collection of collections) {
          for (let i = 0; i < collection.rows.length; i += 500) {
            const chunk = collection.rows
              .slice(i, i + 500)
              .map((r) => ({ ...r, world: g.world, captured_at: g.at }));
            await tx`INSERT INTO ${tx(collection.table)} ${tx(chunk as never)} ON CONFLICT DO NOTHING`;
          }
        }
        for (const r of parsed.orphanRankings)
          await tx`INSERT INTO orphan_rankings(world,captured_at,dataset,id,rank,value) VALUES(${g.world},${g.at},${r.dataset},${r.id},${r.rank},${r.value}) ON CONFLICT DO NOTHING`;
        await tx`UPDATE worlds SET published_at=${g.at},imported_at=now() WHERE world=${g.world} AND (published_at IS NULL OR published_at<${g.at})`;
        await tx`INSERT INTO player_daily(world,day,id,captured_at,points,villages,attack,defense,support,"all") SELECT world,(captured_at AT TIME ZONE 'UTC')::date,id,captured_at,points,villages,attack,defense,support,"all" FROM player_history WHERE world=${g.world} AND captured_at=${g.at} ON CONFLICT(world,day,id) DO UPDATE SET captured_at=EXCLUDED.captured_at,points=EXCLUDED.points,villages=EXCLUDED.villages,attack=EXCLUDED.attack,defense=EXCLUDED.defense,support=EXCLUDED.support,"all"=EXCLUDED."all" WHERE player_daily.captured_at<EXCLUDED.captured_at`;
      }
      for (const c of configs)
        await tx`INSERT INTO world_config(world,captured_at,dataset,payload) VALUES(${g.world},${g.at},${c.dataset},${tx.json(c.payload)}) ON CONFLICT DO NOTHING`;
      for (const o of g.objects)
        await tx`INSERT INTO source_objects(object_key,world,captured_at,sha256,verified,size_bytes) VALUES(${o.key},${g.world},${g.at},${sha(o.body)},${!!o.expectedHash},${o.body.length}) ON CONFLICT DO NOTHING`;
      await tx`INSERT INTO import_groups(world,captured_at,kind,status,provenance,manifest,imported_at) VALUES(${g.world},${g.at},${g.kind},'complete',${g.manifest ? 'manifest' : 'reconstructed'},${g.manifest ? tx.json(g.manifest as never) : null},now()) ON CONFLICT(world,captured_at,kind) DO UPDATE SET status='complete',error=NULL,imported_at=now()`;
      await tx`UPDATE worlds SET imported_at=now() WHERE world=${g.world}`;
    });
  } catch (error) {
    await db`INSERT INTO import_groups(world,captured_at,kind,status,provenance,error) VALUES(${g.world},${g.at},${g.kind},'failed',${g.manifest ? 'manifest' : 'reconstructed'},${error instanceof Error ? error.message : 'Import failed'}) ON CONFLICT(world,captured_at,kind) DO UPDATE SET error=EXCLUDED.error,status=CASE WHEN import_groups.status='complete' THEN 'complete' ELSE 'failed' END`;
    throw error;
  }
}
export async function importEvent(db: DB, world: string, key: string, body: Buffer) {
  const e = parseConquest(body);
  if (e.world !== world || !key.endsWith('/' + e.event_id + '.json'))
    throw Error('Event world/key mismatch');
  await db.begin(async (tx) => {
    await tx`INSERT INTO conquests(world,event_id,village_id,occurred_at,new_owner_id,old_owner_id) VALUES(${world},${e.event_id},${e.village_id},${new Date(e.occurred_at * 1000)},${e.new_owner_id},${e.old_owner_id}) ON CONFLICT DO NOTHING`;
    await tx`INSERT INTO source_objects(object_key,world,captured_at,sha256,verified,size_bytes) VALUES(${key},${world},${new Date(e.occurred_at * 1000)},${sha(body)},true,${body.length}) ON CONFLICT DO NOTHING`;
  });
}
