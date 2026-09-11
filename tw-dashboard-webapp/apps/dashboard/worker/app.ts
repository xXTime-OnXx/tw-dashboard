import { Hono } from 'hono';
import type { DB } from '../../../packages/db/src/index.ts';
import {
  freshness,
  searchPlayers,
  surroundings,
  profile,
  published,
} from '../../../packages/db/src/queries.ts';
import {
  worldSchema,
  idSchema,
  surroundingsSchema,
  viewportSchema,
  annotationSchema,
  preferenceSchema,
  windowSchema,
} from '../../../packages/contracts/src/index.ts';
import { z } from 'zod';
export function createApi(getDb: () => DB, owner: string) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) &&
      c.req.header('Origin') !== new URL(c.req.url).origin
    )
      return c.json({ error: { code: 'ORIGIN', message: 'Same-origin request required' } }, 403);
    await next();
  });
  app.onError((e, c) => {
    if (e instanceof z.ZodError)
      return c.json(
        {
          error: {
            code: 'VALIDATION',
            message: 'Invalid request',
            issues: e.issues.map((i) => ({ path: i.path, message: i.message })),
          },
        },
        400,
      );
    console.error(JSON.stringify({ action: 'api_error', name: e.name }));
    return c.json({ error: { code: 'UNAVAILABLE', message: 'Data temporarily unavailable' } }, 503);
  });
  app.get('/api/v1/worlds', async (c) => {
    const db = getDb();
    const rows = await db`SELECT world FROM worlds ORDER BY world`;
    return c.json(await Promise.all(rows.map((r) => freshness(db, r.world))));
  });
  app.get('/api/v1/:world/status', async (c) => {
    const world = worldSchema.parse(c.req.param('world')),
      db = getDb();
    return c.json({
      freshness: await freshness(db, world),
      runs: await db`SELECT id,started_at,completed_at,status FROM importer_runs WHERE world=${world} ORDER BY id DESC LIMIT 20`,
      groups:
        await db`SELECT captured_at,kind,status,error FROM import_groups WHERE world=${world} AND status<>'complete' ORDER BY captured_at DESC LIMIT 20`,
      storage: await db`SELECT pg_database_size(current_database())::text AS bytes`,
      coverage:
        await db`SELECT min(captured_at) AS first,max(captured_at) AS last,count(*)::int AS snapshots FROM import_groups WHERE world=${world} AND kind='hourly' AND status='complete'`,
    });
  });
  app.get('/api/v1/:world/players', async (c) =>
    c.json(
      await searchPlayers(
        getDb(),
        worldSchema.parse(c.req.param('world')),
        z
          .string()
          .max(100)
          .parse(c.req.query('q') ?? ''),
      ),
    ),
  );
  app.get('/api/v1/:world/surroundings', async (c) =>
    c.json(
      await surroundings(
        getDb(),
        worldSchema.parse(c.req.param('world')),
        owner,
        surroundingsSchema.parse(c.req.query()),
      ),
    ),
  );
  app.get('/api/v1/:world/players/:id', async (c) => {
    const result = await profile(
      getDb(),
      worldSchema.parse(c.req.param('world')),
      owner,
      idSchema.parse(c.req.param('id')),
      windowSchema.parse(c.req.query('window') ?? '24h'),
    );
    return result
      ? c.json(result)
      : c.json(
          { error: { code: 'NOT_FOUND', message: 'Player not found in current snapshot' } },
          404,
        );
  });
  app.get('/api/v1/:world/players/:id/series', async (c) => {
    const db = getDb(),
      world = worldSchema.parse(c.req.param('world')),
      id = idSchema.parse(c.req.param('id'));
    const dates = z
      .object({ from: z.iso.datetime(), to: z.iso.datetime() })
      .refine(
        (v) =>
          Date.parse(v.to) >= Date.parse(v.from) &&
          Date.parse(v.to) - Date.parse(v.from) <= 31 * 86400000,
        'Maximum 31 days',
      )
      .parse(c.req.query());
    return c.json(
      await db`SELECT captured_at,points::text,villages,attack::text,defense::text,support::text,"all"::text FROM player_history WHERE world=${world} AND id=${id} AND captured_at BETWEEN ${dates.from} AND ${dates.to} ORDER BY captured_at`,
    );
  });
  app.get('/api/v1/:world/map', async (c) => {
    const db = getDb(),
      world = worldSchema.parse(c.req.param('world')),
      bounds = viewportSchema.parse(c.req.query()),
      state = await freshness(db, world),
      at = state.publishedAt,
      conquestAt = state.conquestCheckedAt ?? at;
    if (!at) return c.json({ villages: [], observedAt: null, truncated: false });
    const rows =
      await db`SELECT v.id,v.name,v.owner,v.x,v.y,v.points::text,v.rank,p.name AS player_name,p.tribe,t.tag,coalesce(a.relationship,'unknown') AS relationship,EXISTS(SELECT 1 FROM conquests c WHERE c.world=v.world AND c.village_id=v.id AND c.occurred_at>${new Date(+new Date(conquestAt!) - 86400000)} AND c.occurred_at<=${conquestAt}) AS recent_conquest FROM village_history v LEFT JOIN player_history p ON p.world=v.world AND p.captured_at=v.captured_at AND p.id=v.owner LEFT JOIN tribe_history t ON t.world=p.world AND t.captured_at=p.captured_at AND t.id=p.tribe LEFT JOIN annotations a ON a.world=v.world AND a.player_id=v.owner AND a.owner_email=${owner} WHERE v.world=${world} AND v.captured_at=${at} AND v.x BETWEEN ${bounds.minX} AND ${bounds.maxX} AND v.y BETWEEN ${bounds.minY} AND ${bounds.maxY} ORDER BY v.id LIMIT 30001`;
    return c.json({
      villages: rows.slice(0, 30000),
      observedAt: at,
      conquestCheckedAt: state.conquestCheckedAt,
      truncated: rows.length > 30000,
    });
  });
  app.get('/api/v1/:world/villages/:id/events', async (c) => {
    const world = worldSchema.parse(c.req.param('world')),
      id = idSchema.parse(c.req.param('id'));
    return c.json(
      await getDb()`SELECT event_id,occurred_at,old_owner_id,new_owner_id FROM conquests WHERE world=${world} AND village_id=${id} ORDER BY occurred_at DESC LIMIT 100`,
    );
  });
  app.get('/api/v1/preferences', async (c) => {
    const [r] = await getDb()`SELECT payload FROM preferences WHERE owner_email=${owner}`;
    return c.json(r?.payload ?? { world: 'de259', radius: 20, window: '24h' });
  });
  app.put('/api/v1/preferences', async (c) => {
    const p = preferenceSchema.parse(await c.req.json());
    const db = getDb();
    await db`INSERT INTO preferences(owner_email,payload) VALUES(${owner},${db.json(p)}) ON CONFLICT(owner_email) DO UPDATE SET payload=EXCLUDED.payload`;
    return c.json(p);
  });
  app.get('/api/v1/:world/watchlist', async (c) => {
    const world = worldSchema.parse(c.req.param('world'));
    return c.json(
      await getDb()`SELECT player_id,relationship,watched,note FROM annotations WHERE world=${world} AND owner_email=${owner} AND watched=true ORDER BY player_id`,
    );
  });
  app.put('/api/v1/:world/players/:id/annotation', async (c) => {
    const world = worldSchema.parse(c.req.param('world')),
      id = idSchema.parse(c.req.param('id')),
      a = annotationSchema.parse(await c.req.json());
    await getDb()`INSERT INTO annotations(owner_email,world,player_id,relationship,watched,note) VALUES(${owner},${world},${id},${a.relationship},${a.watched},${a.note}) ON CONFLICT(owner_email,world,player_id) DO UPDATE SET relationship=EXCLUDED.relationship,watched=EXCLUDED.watched,note=EXCLUDED.note`;
    return c.json(a);
  });
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404));
  return app;
}
