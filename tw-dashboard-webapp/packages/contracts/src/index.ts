import { z } from 'zod';
export const worldSchema = z.string().regex(/^de\d{1,4}$/);
export const idSchema = z.coerce.number().int().nonnegative().max(2147483647);
export const relationshipSchema = z.enum(['unknown', 'friendly', 'neutral', 'hostile']);
export const windowSchema = z.enum(['24h', '7d', '30d']);
export type Window = z.infer<typeof windowSchema>;
export const windowHours: Record<Window, number> = { '24h': 24, '7d': 168, '30d': 720 };
export const surroundingsSchema = z.object({
  perspective: idSchema,
  center: idSchema.optional(),
  radius: z.coerce.number().min(1).max(100).default(20),
  window: windowSchema.default('24h'),
  search: z.string().max(100).default(''),
  excludeTribe: z.enum(['true', 'false']).default('false'),
  relationship: relationshipSchema.optional(),
  watched: z.enum(['true', 'false']).default('false'),
  sort: z.enum(['distance', 'points', 'name', 'attack', 'growth', 'conquests']).default('distance'),
  direction: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(0).max(100000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const viewportSchema = z
  .object({
    minX: z.coerce.number().min(0).max(999),
    maxX: z.coerce.number().min(0).max(999),
    minY: z.coerce.number().min(0).max(999),
    maxY: z.coerce.number().min(0).max(999),
  })
  .refine((v) => v.minX <= v.maxX && v.minY <= v.maxY, 'Invalid viewport');
export const annotationSchema = z.object({
  relationship: relationshipSchema,
  watched: z.boolean(),
  note: z.string().max(10000),
});
export type Annotation = z.infer<typeof annotationSchema>;
export const preferenceSchema = z.object({
  world: worldSchema.default('de259'),
  perspective: idSchema.optional(),
  radius: z.number().min(1).max(100).default(20),
  window: windowSchema.default('24h'),
});
export type Village = {
  id: number;
  name: string;
  owner: number;
  x: number;
  y: number;
  points: string;
  rank: number;
};
export type Player = {
  id: number;
  name: string;
  tribe: number;
  villages: number;
  points: string;
  rank: number;
  attack: string | null;
  defense: string | null;
  support: string | null;
  all: string | null;
};
export type Tribe = {
  id: number;
  name: string;
  tag: string;
  members: number;
  villages: number;
  points: string;
  allPoints: string;
  rank: number;
  attack: string | null;
  defense: string | null;
  all: string | null;
};
export type Conquest = {
  event_id: string;
  world: string;
  village_id: number;
  occurred_at: number;
  new_owner_id: number;
  old_owner_id: number;
};
export type Evidence = {
  kind: string;
  label: string;
  detail: string;
  from: string;
  to: string;
  sourceIds: string[];
};
export type PlayerRow = Player & {
  tribeTag: string | null;
  distance: number;
  localVillages: number;
  delta: string | null;
  attackDelta: string | null;
  growth: number | null;
  gained: number;
  lost: number;
  annotation: Annotation;
  evidence: Evidence[];
  coverage: boolean;
  lastChange: string | null;
};
export type Freshness = {
  world: string;
  publishedAt: string | null;
  conquestCheckedAt: string | null;
  importedAt: string | null;
  snapshotStale: boolean;
  conquestStale: boolean;
};
export type Surroundings = {
  conquestCheckedAt: string | null;
  rows: PlayerRow[];
  total: number;
  observedAt: string | null;
  baselineAt: string | null;
  anchors: Village[];
  perspective: Player | null;
  coverage: boolean;
};
export const emptyAnnotation: Annotation = { relationship: 'unknown', watched: false, note: '' };
