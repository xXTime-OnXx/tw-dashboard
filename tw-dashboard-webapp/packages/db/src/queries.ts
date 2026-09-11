import type { DB } from './index.ts';
import {
  baselineValid,
  delta,
  growth,
  simpleEvidence,
  distance,
  fullCoverage,
  intervalsCover,
} from '../../analytics/src/index.ts';
import {
  emptyAnnotation,
  windowHours,
  type Player,
  type Village,
  type PlayerRow,
  type Surroundings,
  type Freshness,
  type Window,
} from '../../contracts/src/index.ts';
import { surroundingsSchema } from '../../contracts/src/index.ts';
import type { z } from 'zod';
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
export async function freshness(db: DB, world: string): Promise<Freshness> {
  const [r] = await db`SELECT * FROM worlds WHERE world=${world}`;
  return {
    world,
    publishedAt: iso(r?.published_at),
    conquestCheckedAt: iso(r?.conquest_checked_at),
    importedAt: iso(r?.imported_at),
    snapshotStale: !r?.published_at || Date.now() - +r.published_at > 7200000,
    conquestStale: !r?.conquest_checked_at || Date.now() - +r.conquest_checked_at > 900000,
  };
}
export async function published(db: DB, world: string) {
  return (await freshness(db, world)).publishedAt;
}
export async function baseline(db: DB, world: string, at: string, window: Window) {
  const target = new Date(+new Date(at) - windowHours[window] * 3600000);
  const [r] =
    await db`SELECT max(captured_at) AS at FROM import_groups WHERE world=${world} AND kind='hourly' AND status='complete' AND captured_at<=${target}`;
  const t = iso(r?.at);
  return baselineValid(t, target) ? t : null;
}
export async function playerAt(
  db: DB,
  world: string,
  id: number,
  at: string,
): Promise<Player | null> {
  const [r] =
    await db`SELECT id,name,tribe,villages,points::text,rank,attack::text,defense::text,support::text,"all"::text FROM player_history WHERE world=${world} AND captured_at=${at} AND id=${id}`;
  return (r as Player) ?? null;
}
export async function villagesAt(
  db: DB,
  world: string,
  at: string,
  owner: number,
): Promise<Village[]> {
  return (await db`SELECT id,name,owner,x,y,points::text,rank FROM village_history WHERE world=${world} AND captured_at=${at} AND owner=${owner} ORDER BY points DESC,id`) as unknown as Village[];
}
export async function searchPlayers(db: DB, world: string, q: string) {
  const at = await published(db, world);
  if (!at) return [];
  return db`SELECT p.id,p.name,p.points::text,p.villages,t.tag FROM player_history p LEFT JOIN tribe_history t ON t.world=p.world AND t.captured_at=p.captured_at AND t.id=p.tribe WHERE p.world=${world} AND p.captured_at=${at} AND p.name ILIKE ${'%' + q + '%'} ORDER BY p.rank,p.id LIMIT 30`;
}
export async function surroundings(
  db: DB,
  world: string,
  owner: string,
  q: z.infer<typeof surroundingsSchema>,
): Promise<Surroundings> {
  const state = await freshness(db, world);
  const at = state.publishedAt;
  const conquestAt = state.conquestCheckedAt ?? at;
  const empty = {
    rows: [],
    total: 0,
    observedAt: at,
    conquestCheckedAt: state.conquestCheckedAt,
    baselineAt: null,
    anchors: [],
    perspective: null,
    coverage: false,
  };
  if (!at) return empty;
  const perspective = await playerAt(db, world, q.perspective, at);
  if (!perspective) return empty;
  const allAnchors = await villagesAt(db, world, at, q.perspective);
  const anchors = q.center === undefined ? allAnchors : allAnchors.filter((v) => v.id === q.center);
  if (!anchors.length) return { ...empty, perspective };
  const base = await baseline(db, world, at, q.window);
  const perspectiveBase = base ? await playerAt(db, world, q.perspective, base) : null;
  const order = {
    distance: 'distance',
    points: 'points',
    name: 'name',
    attack: 'attack',
    growth: 'growth',
    conquests: 'gained',
  }[q.sort];
  const from = base ?? new Date(+new Date(at) - windowHours[q.window] * 3600000).toISOString();
  const conquestFrom = new Date(
    +new Date(conquestAt!) - windowHours[q.window] * 3600000,
  ).toISOString();
  const rows = await db`
 WITH nearby AS (
 SELECT v.owner, count(*)::int AS local_villages,min(d.distance) AS distance
 FROM village_history v CROSS JOIN LATERAL (
 SELECT min(sqrt(power(v.x-a.x,2)+power(v.y-a.y,2))) AS distance FROM village_history a
 WHERE a.world=${world} AND a.captured_at=${at} AND a.owner=${q.perspective}
 AND (${q.center ?? null}::int IS NULL OR a.id=${q.center ?? null})
 AND v.x BETWEEN a.x-${q.radius} AND a.x+${q.radius} AND v.y BETWEEN a.y-${q.radius} AND a.y+${q.radius}
 ) d WHERE v.world=${world} AND v.captured_at=${at} AND v.owner<>0 AND v.owner<>${q.perspective} AND d.distance<=${q.radius} GROUP BY v.owner
 ), result AS (
 SELECT p.*,p.points::text AS points_text,p.attack::text AS attack_text,p.defense::text AS defense_text,p.support::text AS support_text,p."all"::text AS all_text,
 b.points::text AS base_points,b.attack::text AS base_attack,b.defense::text AS base_defense,b.support::text AS base_support,b."all"::text AS base_all,b.tribe AS base_tribe,b.villages AS base_villages,
 t.tag AS tribe_tag,n.distance,n.local_villages,a.relationship,a.watched,a.note,
 CASE WHEN b.points>0 THEN (p.points-b.points)*100.0/b.points ELSE NULL END AS growth,
 (SELECT count(*)::int FROM conquests c WHERE c.world=${world} AND c.new_owner_id=p.id AND c.occurred_at>${conquestFrom} AND c.occurred_at<=${conquestAt}) AS gained,
 (SELECT count(*)::int FROM conquests c WHERE c.world=${world} AND c.old_owner_id=p.id AND c.occurred_at>${conquestFrom} AND c.occurred_at<=${conquestAt}) AS lost
 FROM nearby n JOIN player_history p ON p.world=${world} AND p.captured_at=${at} AND p.id=n.owner
 LEFT JOIN player_history b ON b.world=p.world AND b.captured_at=${base} AND b.id=p.id
 LEFT JOIN tribe_history t ON t.world=p.world AND t.captured_at=p.captured_at AND t.id=p.tribe
 LEFT JOIN annotations a ON a.owner_email=${owner} AND a.world=p.world AND a.player_id=p.id
 WHERE p.name ILIKE ${'%' + q.search + '%'} AND (${q.excludeTribe === 'false'} OR p.tribe<>${perspective.tribe} OR p.tribe=0)
 AND (${q.relationship ?? null}::text IS NULL OR coalesce(a.relationship,'unknown')=${q.relationship ?? null})
 AND (${q.watched === 'false'} OR a.watched=true)
 ) SELECT *,count(*) OVER()::int AS total FROM result ORDER BY ${db.unsafe(order)} ${db.unsafe(q.direction)} NULLS LAST,id LIMIT ${q.limit} OFFSET ${q.page * q.limit}`;
  const snapshots = base
    ? await db`SELECT captured_at FROM import_groups WHERE world=${world} AND kind='hourly' AND status='complete' AND captured_at BETWEEN ${base} AND ${at} ORDER BY captured_at`
    : [];
  const coverage =
    !!base &&
    fullCoverage(
      snapshots.map((r) => iso(r.captured_at)!),
      base,
      at,
    );
  const checks =
    await db`SELECT queried_from,queried_until FROM conquest_coverage WHERE world=${world} AND queried_until>=${from} AND queried_from<=${at}`;
  const eventCoverage = intervalsCover(
    checks.map((r) => ({ from: iso(r.queried_from)!, to: iso(r.queried_until)! })),
    from,
    at,
  );
  const result: PlayerRow[] = [];
  for (const r of rows) {
    const p: Player = {
      id: r.id,
      name: r.name,
      tribe: r.tribe,
      villages: r.villages,
      rank: r.rank,
      points: r.points_text,
      attack: r.attack_text,
      defense: r.defense_text,
      support: r.support_text,
      all: r.all_text,
    };
    const b: Player | null =
      r.base_points === null
        ? null
        : {
            ...p,
            points: r.base_points,
            attack: r.base_attack,
            defense: r.base_defense,
            support: r.base_support,
            all: r.base_all,
            tribe: r.base_tribe,
            villages: r.base_villages,
          };
    const evidence = simpleEvidence(
      p,
      b,
      growth(perspective.points, perspectiveBase?.points ?? null),
      from,
      at,
    );
    const changes =
      await db`SELECT captured_at,tribe,points::text,villages,attack::text,defense::text,support::text,"all"::text FROM player_history WHERE world=${world} AND id=${p.id} AND captured_at BETWEEN ${from} AND ${at} ORDER BY captured_at`;
    let lastChange: string | null = null;
    for (let i = 1; i < changes.length; i++) {
      const prev = changes[i - 1],
        next = changes[i];
      if (
        ['tribe', 'points', 'villages', 'attack', 'defense', 'support', 'all'].some(
          (k) => prev[k] !== next[k],
        )
      )
        lastChange = iso(next.captured_at);
      if (prev.tribe !== next.tribe)
        evidence.push({
          kind: 'tribe-change',
          label: 'Tribe change',
          detail: `Observed tribe ${prev.tribe} → ${next.tribe}.`,
          from: iso(prev.captured_at)!,
          to: iso(next.captured_at)!,
          sourceIds: [iso(prev.captured_at)!, iso(next.captured_at)!],
        });
    }
    const events =
      await db`SELECT c.*,v.x,v.y FROM conquests c LEFT JOIN LATERAL (SELECT x,y FROM village_history WHERE world=c.world AND id=c.village_id AND captured_at<=${at} ORDER BY captured_at DESC LIMIT 1) v ON true WHERE c.world=${world} AND c.new_owner_id=${p.id} AND c.occurred_at>${conquestFrom} AND c.occurred_at<=${conquestAt}`;
    const oldVillages = base ? await villagesAt(db, world, base, p.id) : [];
    const oldDistance = oldVillages.length
      ? Math.min(...oldVillages.flatMap((v) => anchors.map((a) => distance(v, a))))
      : null;
    for (const e of events) {
      if (e.x === null) continue;
      const d = Math.min(...anchors.map((a) => distance(a, e as { x: number; y: number })));
      if (d <= q.radius)
        evidence.push({
          kind: 'nearby-conquest',
          label: 'Nearby conquest',
          detail: `Village ${e.village_id} (${e.x}|${e.y}), ${d.toFixed(1)} fields from your anchors.`,
          from: iso(e.occurred_at)!,
          to: conquestAt!,
          sourceIds: [e.event_id],
        });
      if (oldDistance !== null && d < oldDistance)
        evidence.push({
          kind: 'expansion-closer',
          label: 'Expansion closer',
          detail: `Acquisition ${d.toFixed(1)} fields away; nearest baseline village ${oldDistance.toFixed(1)} fields away.`,
          from,
          to: conquestAt!,
          sourceIds: [e.event_id, base!],
        });
    }
    const knownCounters = changes.every((c) =>
      ['attack', 'defense', 'support', 'all'].every((k) => c[k] !== null),
    );
    if (
      coverage &&
      eventCoverage &&
      b &&
      knownCounters &&
      changes.length === snapshots.length &&
      !lastChange &&
      r.gained === 0 &&
      r.lost === 0 &&
      !(
        await db`SELECT 1 FROM conquests WHERE world=${world} AND (new_owner_id=${p.id} OR old_owner_id=${p.id}) AND occurred_at>${from} AND occurred_at<=${at} LIMIT 1`
      ).length
    )
      evidence.push({
        kind: 'no-observed-changes',
        label: 'No observed changes',
        detail:
          'All tracked public statistics were unchanged; no conquests were recorded in a covered window. This does not establish inactivity.',
        from,
        to: at,
        sourceIds: [from, at],
      });

    result.push({
      ...p,
      tribeTag: r.tribe_tag,
      distance: r.distance,
      localVillages: r.local_villages,
      delta: delta(p.points, b?.points ?? null),
      attackDelta: delta(p.attack, b?.attack ?? null),
      growth: growth(p.points, b?.points ?? null),
      gained: r.gained,
      lost: r.lost,
      annotation: {
        relationship: r.relationship ?? 'unknown',
        watched: r.watched ?? false,
        note: r.note ?? '',
      },
      evidence,
      coverage: coverage && !!b,
      lastChange,
    });
  }
  const total =
    rows[0]?.total ??
    (q.page > 0 ? (await surroundings(db, world, owner, { ...q, page: 0, limit: 1 })).total : 0);
  return {
    rows: result,
    total,
    observedAt: at,
    conquestCheckedAt: state.conquestCheckedAt,
    baselineAt: base,
    anchors,
    perspective,
    coverage,
  };
}
export async function profile(db: DB, world: string, owner: string, id: number, window: Window) {
  const state = await freshness(db, world);
  const at = state.publishedAt;
  const conquestAt = state.conquestCheckedAt ?? at;
  if (!at) return null;
  const player = await playerAt(db, world, id, at);
  if (!player) return null;
  const base = await baseline(db, world, at, window);
  const from = new Date(+new Date(at) - windowHours[window] * 3600000).toISOString();
  const villages = await villagesAt(db, world, at, id);
  const history =
    window === '24h'
      ? await db`SELECT captured_at,points::text,villages,attack::text,defense::text,support::text,"all"::text FROM player_history WHERE world=${world} AND id=${id} AND captured_at BETWEEN ${from} AND ${at} ORDER BY captured_at`
      : await db`SELECT captured_at,points::text,villages,attack::text,defense::text,support::text,"all"::text FROM player_daily WHERE world=${world} AND id=${id} AND captured_at BETWEEN ${from} AND ${at} ORDER BY captured_at`;
  const conquestFrom = new Date(
    +new Date(conquestAt!) - windowHours[window] * 3600000,
  ).toISOString();
  const events =
    await db`SELECT event_id,village_id,occurred_at,new_owner_id,old_owner_id FROM conquests WHERE world=${world} AND (new_owner_id=${id} OR old_owner_id=${id}) AND occurred_at>${conquestFrom} AND occurred_at<=${conquestAt} ORDER BY occurred_at DESC LIMIT 100`;
  const tribes =
    await db`SELECT captured_at,tribe FROM (SELECT captured_at,tribe,lag(tribe) OVER(ORDER BY captured_at) AS previous FROM player_history WHERE world=${world} AND id=${id} AND captured_at BETWEEN ${from} AND ${at}) t WHERE previous IS NOT NULL AND previous<>tribe ORDER BY captured_at DESC LIMIT 100`;
  const [annotation] =
    await db`SELECT relationship,watched,note FROM annotations WHERE owner_email=${owner} AND world=${world} AND player_id=${id}`;
  return {
    player,
    villages,
    history,
    events,
    tribes,
    annotation: annotation ?? emptyAnnotation,
    observedAt: at,
    conquestCheckedAt: state.conquestCheckedAt,
    baselineAt: base,
    resolution: window === '24h' ? 'hourly' : 'daily',
  };
}
