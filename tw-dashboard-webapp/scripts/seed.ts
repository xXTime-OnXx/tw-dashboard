import { connect } from '../packages/db/src/index.ts';
import { migrate } from '../packages/db/src/migrate.ts';
import { importGroup } from '../apps/importer/src/import.ts';
import { fixture } from '../tests/fixtures.ts';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw Error('Only TEST_DATABASE_URL ending _test is allowed');
const db = connect(url);
try {
  await migrate(db);
  for (let hour = 0; hour <= 24; hour++) {
    const g = fixture(new Date(Date.UTC(2026, 8, 9, 12 + hour)).toISOString(), 1000 + hour * 20);
    g.world = 'de259';
    g.objects = g.objects.map((o) => ({ ...o, key: 'e2e/' + o.key }));
    await importGroup(db, g);
  }
  console.log('Synthetic E2E world seeded in test database only');
} finally {
  await db.end();
}
