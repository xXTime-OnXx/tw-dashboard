import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate as applyMigrations } from 'drizzle-orm/postgres-js/migrator';
import { connect, connectForMigrations } from './index.ts';
export async function migrate(db: ReturnType<typeof connect>) {
  // Dedicated client: Drizzle configures date codecs, so do not mutate the app client.
  const connection = connectForMigrations(db);
  try {
    await connection`SELECT pg_advisory_lock(918234)`;
    await applyMigrations(drizzle(connection), {
      migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
    });
  } finally {
    try {
      await connection`SELECT pg_advisory_unlock(918234)`;
    } finally {
      await connection.end();
    }
  }
}
if (process.argv[1]?.endsWith('migrate.ts')) {
  if (!process.env.DATABASE_URL) throw Error('DATABASE_URL required');
  const db = connect(process.env.DATABASE_URL);
  try {
    await migrate(db);
    console.log('Migrations applied');
  } finally {
    await db.end();
  }
}
