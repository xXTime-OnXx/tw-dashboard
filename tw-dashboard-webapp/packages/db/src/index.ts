import postgres from 'postgres';
const connectionUrls = new WeakMap<object, string>();
export function connect(url: string) {
  const client = postgres(url, {
    max: 3,
    onnotice: () => {},
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 20,
    transform: { undefined: null },
  });
  connectionUrls.set(client, url);
  return client;
}
export type DB = ReturnType<typeof connect>;
export function connectForMigrations(db: DB) {
  const url = connectionUrls.get(db);
  if (!url) throw Error('Migration client must originate from connect()');
  return postgres(url, { max: 1, prepare: false, onnotice: () => {} });
}
export * from './queries.ts';
