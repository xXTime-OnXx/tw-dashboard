import { connect } from '../packages/db/src/index.ts';
import { surroundings } from '../packages/db/src/queries.ts';
import { surroundingsSchema } from '../packages/contracts/src/index.ts';
import { createApi } from '../apps/dashboard/worker/app.ts';
if (!process.env.DATABASE_URL) throw Error('DATABASE_URL required');
const db = connect(process.env.DATABASE_URL);
try {
  const [p] =
    await db`SELECT id FROM player_history WHERE world='de259' ORDER BY points DESC LIMIT 1`;
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    const result = await surroundings(
      db,
      'de259',
      'local@localhost',
      surroundingsSchema.parse({ perspective: p.id }),
    );
    console.log(
      JSON.stringify({
        query: 'surroundings',
        run: i,
        ms: Math.round(performance.now() - start),
        perspective: p.id,
        total: result.total,
      }),
    );
  }
  const app = createApi(() => db, 'local@localhost');
  const start = performance.now();
  const response = await app.request(
    'http://localhost/api/v1/de259/map?minX=0&minY=0&maxX=999&maxY=999',
  );
  const payload = (await response.json()) as { villages: unknown[] };
  console.log(
    JSON.stringify({
      query: 'full-map',
      ms: Math.round(performance.now() - start),
      villages: payload.villages.length,
    }),
  );
  console.log(
    JSON.stringify((await db`SELECT pg_database_size(current_database())::text AS bytes`)[0]),
  );
} finally {
  await db.end();
}
