import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { connect } from '../packages/db/src/index.ts';
import { migrate } from '../packages/db/src/migrate.ts';
import { importGroup, importEvent } from '../apps/importer/src/import.ts';
import { surroundings, profile } from '../packages/db/src/queries.ts';
import { surroundingsSchema } from '../packages/contracts/src/index.ts';
import { createApi } from '../apps/dashboard/worker/app.ts';
import { fixture } from './fixtures.ts';
import { sha } from '../apps/importer/src/parse.ts';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('isolated PostgreSQL', () => {
  if (url && !new URL(url).pathname.endsWith('_test'))
    throw Error('TEST_DATABASE_URL must target a database ending _test');
  const db = connect(url ?? 'postgres://localhost/unused_test');
  beforeAll(async () => {
    await migrate(db);
    await db`TRUNCATE worlds,import_groups,source_objects,manifests,player_history,village_history,tribe_history,conquests,world_config,player_daily,annotations,preferences,orphan_rankings,conquest_coverage`;
  });
  afterAll(() => db.end());
  it('publishes complete groups, resumes duplicates and retains newer current state', async () => {
    await importGroup(db, fixture('2026-09-10T12:00:00Z', 1400));
    await importGroup(db, fixture('2026-09-09T12:00:00Z', 1000));
    await importGroup(db, fixture('2026-09-10T12:00:00Z', 1400));
    const [world] = await db`SELECT published_at FROM worlds WHERE world='de999'`;
    expect(world.published_at.toISOString()).toBe('2026-09-10T12:00:00.000Z');
    const [count] = await db`SELECT count(*)::int AS n FROM player_history`;
    expect(count.n).toBe(10);
  });
  it('records partial failure without replacing current data, then permits retry', async () => {
    const g = fixture('2026-09-10T13:00:00Z');
    g.objects.pop();
    await expect(importGroup(db, g)).rejects.toThrow('Incomplete');
    const [r] = await db`SELECT status FROM import_groups WHERE captured_at='2026-09-10T13:00:00Z'`;
    expect(r.status).toBe('failed');
    const [w] = await db`SELECT published_at FROM worlds`;
    expect(w.published_at.toISOString()).toBe('2026-09-10T12:00:00.000Z');
  });
  it('returns deduplicated opponents, exact boundaries, baseline changes and missing counters', async () => {
    const result = await surroundings(
      db,
      'de999',
      'owner@example.test',
      surroundingsSchema.parse({ perspective: 1, radius: 20 }),
    );
    expect(result.rows.map((p) => p.id)).toEqual([5, 2, 4]);
    expect(result.rows.find((p) => p.id === 2)?.localVillages).toBe(2);
    expect(result.rows.find((p) => p.id === 2)?.delta).toBe('400');
    expect(result.rows.find((p) => p.id === 5)?.attack).toBeNull();
    expect(result.coverage).toBe(false);
  });
  it('retains unresolved conquest references and deduplicates events', async () => {
    const e = {
      world: 'de999',
      village_id: 9999,
      occurred_at: 1789041600,
      new_owner_id: 999,
      old_owner_id: 0,
      event_id: sha('de999:9999:1789041600:999:0'),
    };
    const body = Buffer.from(JSON.stringify(e)),
      key = 'events/' + e.event_id + '.json';
    await importEvent(db, 'de999', key, body);
    await importEvent(db, 'de999', key, body);
    expect((await db`SELECT count(*)::int AS n FROM conquests`)[0].n).toBe(1);
  });
  it('persists annotations, enforces origins and returns structured validation errors', async () => {
    const app = createApi(() => db, 'owner@example.test');
    const url = 'http://localhost/api/v1/de999/players/2/annotation';
    const body = JSON.stringify({ relationship: 'hostile', watched: true, note: 'A private note' });
    expect(
      (
        await app.request(url, {
          method: 'PUT',
          headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' },
          body,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request(url, {
          method: 'PUT',
          headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' },
          body,
        })
      ).status,
    ).toBe(200);
    const p = await profile(db, 'de999', 'owner@example.test', 2, '24h');
    expect(p?.annotation.note).toBe('A private note');
    const other = await profile(db, 'de999', 'other@example.test', 2, '24h');
    expect(other?.annotation.note).toBe('');
    expect(
      (await app.request('http://localhost/api/v1/de999/surroundings?perspective=1&radius=10000'))
        .status,
    ).toBe(400);
  });
  it('requires observed event coverage before claiming a quiet window', async () => {
    for (let hour = 0; hour <= 24; hour++) {
      const g = fixture(new Date(Date.UTC(2026, 8, 9, 12 + hour)).toISOString(), 1000);
      g.world = 'de998';
      g.objects = g.objects.map((o) => ({ ...o, key: 'coverage/' + o.key }));
      await importGroup(db, g);
    }
    const query = () =>
      surroundings(db, 'de998', 'owner@example.test', surroundingsSchema.parse({ perspective: 1 }));
    expect(
      (await query()).rows
        .find((p) => p.id === 2)
        ?.evidence.some((e) => e.kind === 'no-observed-changes'),
    ).toBe(false);
    await db`INSERT INTO conquest_coverage(world,object_key,queried_from,queried_until,event_count) VALUES('de998','covered','2026-09-09T12:00:00Z','2026-09-10T12:00:00Z',0)`;
    const covered = await query();
    expect(
      covered.rows.find((p) => p.id === 2)?.evidence.some((e) => e.kind === 'no-observed-changes'),
    ).toBe(true);
    expect(
      covered.rows.find((p) => p.id === 5)?.evidence.some((e) => e.kind === 'no-observed-changes'),
    ).toBe(false);
    await db`UPDATE player_history SET tribe=10 WHERE world='de998' AND id=2 AND captured_at='2026-09-10T11:00:00Z'`;
    const changed = await query();
    expect(
      changed.rows.find((p) => p.id === 2)?.evidence.filter((e) => e.kind === 'tribe-change'),
    ).toHaveLength(2);
    expect(
      changed.rows.find((p) => p.id === 2)?.evidence.some((e) => e.kind === 'no-observed-changes'),
    ).toBe(false);
  });
  it('preserves totals for empty pages and refuses bad hashes without publishing', async () => {
    const result = await surroundings(
      db,
      'de999',
      'owner@example.test',
      surroundingsSchema.parse({ perspective: 1, page: 99 }),
    );
    expect(result.total).toBe(3);
    expect(result.rows).toHaveLength(0);
    const g = fixture('2026-09-10T14:00:00Z');
    g.objects[0].expectedHash = 'invalid';
    await expect(importGroup(db, g)).rejects.toThrow('Checksum');
    const valid = fixture('2026-09-10T13:00:00Z');
    await importGroup(db, valid);
    expect(
      (
        await db`SELECT status FROM import_groups WHERE world='de999' AND captured_at='2026-09-10T13:00:00Z'`
      )[0].status,
    ).toBe('complete');
  });
  it('shows conquests collected after the hourly snapshot with independent freshness', async () => {
    const occurred = Math.floor(Date.parse('2026-09-10T12:05:00Z') / 1000);
    const e = {
      world: 'de998',
      village_id: 3,
      occurred_at: occurred,
      new_owner_id: 2,
      old_owner_id: 1,
      event_id: sha(`de998:3:${occurred}:2:1`),
    };
    await importEvent(
      db,
      'de998',
      'events/' + e.event_id + '.json',
      Buffer.from(JSON.stringify(e)),
    );
    await db`UPDATE worlds SET conquest_checked_at='2026-09-10T12:10:00Z' WHERE world='de998'`;
    const result = await surroundings(
      db,
      'de998',
      'owner@example.test',
      surroundingsSchema.parse({ perspective: 1 }),
    );
    expect(result.observedAt).toBe('2026-09-10T12:00:00.000Z');
    expect(result.conquestCheckedAt).toBe('2026-09-10T12:10:00.000Z');
    expect(result.rows.find((p) => p.id === 2)?.gained).toBe(1);
    const detail = await profile(db, 'de998', 'owner@example.test', 2, '24h');
    expect(detail?.events.some((event) => event.event_id === e.event_id)).toBe(true);
  });
  it('remembers manifests even when the historical group was already imported', async () => {
    const g = fixture('2026-09-10T12:00:00Z', 1400);
    g.manifest = {
      world: g.world,
      captured_at: g.at,
      snapshots: g.objects.map((o) => ({ name: o.dataset, key: o.key })),
    };
    await importGroup(db, g);
    await importGroup(db, g);
    const rows =
      await db`SELECT payload FROM manifests WHERE world=${g.world} AND captured_at=${g.at}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toEqual(g.manifest);
  });
});
