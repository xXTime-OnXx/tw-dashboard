import {
  pgTable,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  jsonb,
  primaryKey,
} from 'drizzle-orm/pg-core';
export const worlds = pgTable('worlds', {
  world: text().primaryKey(),
  hostname: text().notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  conquestCheckedAt: timestamp('conquest_checked_at', { withTimezone: true }),
  importedAt: timestamp('imported_at', { withTimezone: true }),
});
export const annotations = pgTable(
  'annotations',
  {
    ownerEmail: text('owner_email').notNull(),
    world: text().notNull(),
    playerId: integer('player_id').notNull(),
    relationship: text().notNull(),
    watched: boolean().notNull(),
    note: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.ownerEmail, t.world, t.playerId] })],
);
export const preferences = pgTable('preferences', {
  ownerEmail: text('owner_email').primaryKey(),
  payload: jsonb().notNull(),
});
export const conquests = pgTable(
  'conquests',
  {
    world: text().notNull(),
    eventId: text('event_id').notNull(),
    villageId: integer('village_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    newOwnerId: integer('new_owner_id').notNull(),
    oldOwnerId: integer('old_owner_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.world, t.eventId] })],
);
// Partition creation and history indexes are owned by reviewed SQL migrations, not automatic schema push.

const observation = () => ({
  world: text().notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  id: integer().notNull(),
});
const counters = () => ({
  attack: bigint({ mode: 'bigint' }),
  defense: bigint({ mode: 'bigint' }),
  all: bigint({ mode: 'bigint' }),
});
export const playerHistory = pgTable(
  'player_history',
  {
    ...observation(),
    name: text().notNull(),
    tribe: integer().notNull(),
    villages: integer().notNull(),
    points: bigint({ mode: 'bigint' }).notNull(),
    rank: integer().notNull(),
    ...counters(),
    support: bigint({ mode: 'bigint' }),
  },
  (t) => [primaryKey({ columns: [t.world, t.capturedAt, t.id] })],
);
export const villageHistory = pgTable(
  'village_history',
  {
    ...observation(),
    name: text().notNull(),
    owner: integer().notNull(),
    x: integer().notNull(),
    y: integer().notNull(),
    points: bigint({ mode: 'bigint' }).notNull(),
    rank: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.world, t.capturedAt, t.id] })],
);
export const tribeHistory = pgTable(
  'tribe_history',
  {
    ...observation(),
    name: text().notNull(),
    tag: text().notNull(),
    members: integer().notNull(),
    villages: integer().notNull(),
    points: bigint({ mode: 'bigint' }).notNull(),
    allPoints: bigint('all_points', { mode: 'bigint' }).notNull(),
    rank: integer().notNull(),
    ...counters(),
  },
  (t) => [primaryKey({ columns: [t.world, t.capturedAt, t.id] })],
);
export const importGroups = pgTable(
  'import_groups',
  {
    world: text().notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
    kind: text().notNull(),
    status: text().notNull(),
    provenance: text().notNull(),
    manifest: jsonb(),
    error: text(),
    importedAt: timestamp('imported_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.world, t.capturedAt, t.kind] })],
);
export const sourceObjects = pgTable('source_objects', {
  objectKey: text('object_key').primaryKey(),
  world: text().notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  sha256: text().notNull(),
  verified: boolean().notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
});
export const manifests = pgTable(
  'manifests',
  {
    world: text().notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
    kind: text().notNull(),
    contentHash: text('content_hash').notNull(),
    payload: jsonb().notNull(),
  },
  (t) => [primaryKey({ columns: [t.world, t.capturedAt, t.kind, t.contentHash] })],
);
export const worldConfig = pgTable(
  'world_config',
  {
    world: text().notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
    dataset: text().notNull(),
    payload: jsonb().notNull(),
  },
  (t) => [primaryKey({ columns: [t.world, t.capturedAt, t.dataset] })],
);
export const conquestCoverage = pgTable('conquest_coverage', {
  world: text().notNull(),
  objectKey: text('object_key').primaryKey(),
  queriedFrom: timestamp('queried_from', { withTimezone: true }).notNull(),
  queriedUntil: timestamp('queried_until', { withTimezone: true }).notNull(),
  eventCount: integer('event_count').notNull(),
});
